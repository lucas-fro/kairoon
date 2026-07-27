import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { and, eq, gte, inArray, ne } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients } from '../../db/schema'
import { createAppointmentToken, verifyAppointmentToken } from '../../lib/appointmentToken'
import { addMinutesToTime, minutesUntil, todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { lockEmployeeDay } from '../../lib/locks'
import { getAccessState } from '../../lib/plan'
import { redisConnection, withRedisTimeout } from '../../lib/redis'
import { normalizePhone, timesOverlap } from '../../lib/slots'
import { notify } from '../../notifications/dispatcher'
import { notifyAppointmentById } from '../../notifications/appointment'
import {
  assertBookableSlot,
  findEstablishmentBySlug,
  getAvailability,
  resolveEmployee,
} from '../public/service'
import type { RescheduleInput } from './schemas'

/**
 * Área pública de gerenciamento do agendamento (cancelar/remarcar pelo próprio
 * cliente, sem conta). A autorização é sempre o token HMAC do agendamento
 * (lib/appointmentToken.ts), entregue de dois jeitos:
 *
 *  - no link enviado por WhatsApp/e-mail (1 clique), ou
 *  - pelo fluxo de código: quem prova controlar o telefone recebe os tokens dos
 *    seus agendamentos futuros.
 *
 * Um caminho de autorização só, em vez de token + sessão: menos superfície e
 * nada para expirar do lado do servidor.
 */

/** Antecedência mínima para o cliente mexer sozinho no agendamento. */
const MIN_MINUTES_BEFORE_CHANGE = 120

/** Validade do código de 6 dígitos, em segundos. */
const CODE_TTL_SECONDS = 600

/** Intervalo mínimo entre dois envios de código para o mesmo telefone. */
const CODE_COOLDOWN_SECONDS = 60

/** Tentativas erradas antes de o código ser invalidado. */
const MAX_CODE_ATTEMPTS = 5

/** Status de um agendamento "vivo": ainda vale e ainda pode ser alterado. */
const STATUSES_OPEN: ('confirmed' | 'pending')[] = ['confirmed', 'pending']

function codeKey(establishmentId: string, phone: string): string {
  return `manage-code:${establishmentId}:${phone}`
}

function cooldownKey(establishmentId: string, phone: string): string {
  return `manage-code-sent:${establishmentId}:${phone}`
}

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** Formato devolvido ao navegador. Nunca inclui dados de outros clientes. */
function toPublicAppointment(row: {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  client: { name: string }
  service: { name: string; durationMinutes: number; priceCents: number }
  employee: { id: string; name: string }
}) {
  return {
    id: row.id,
    token: createAppointmentToken(row.id),
    date: row.date,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    clientName: row.client.name,
    service: row.service,
    employee: row.employee,
    // Regras aplicadas no servidor; a UI só desabilita os botões de acordo.
    canChange:
      (STATUSES_OPEN as string[]).includes(row.status) &&
      minutesUntil(row.date, row.startTime) >= MIN_MINUTES_BEFORE_CHANGE,
  }
}

const appointmentWith = {
  client: { columns: { id: true, name: true, phone: true } },
  service: { columns: { name: true, durationMinutes: true, priceCents: true } },
  employee: { columns: { id: true, name: true } },
} as const

/**
 * Resolve o agendamento a partir do token, garantindo que ele pertence ao
 * estabelecimento da URL. Erro sempre genérico (404): token inválido, expirado
 * ou de outro estabelecimento não devem ser distinguíveis.
 */
async function requireAppointment(slug: string, token: string) {
  const appointmentId = verifyAppointmentToken(token)
  if (!appointmentId) throw new AppError('Agendamento não encontrado', 404)

  const establishment = await findEstablishmentBySlug(slug)
  const row = await db.query.appointments.findFirst({
    where: and(
      eq(appointments.id, appointmentId),
      eq(appointments.establishmentId, establishment.id),
    ),
    with: appointmentWith,
  })
  if (!row) throw new AppError('Agendamento não encontrado', 404)

  return { establishment, appointment: row }
}

/** Barra a alteração fora da política (concluído, cancelado ou em cima da hora). */
function assertChangeable(row: { status: string; date: string; startTime: string }) {
  if (row.status === 'cancelled') throw new AppError('Este agendamento já foi cancelado', 400)
  if (row.status === 'completed') throw new AppError('Este atendimento já foi realizado', 400)
  if (minutesUntil(row.date, row.startTime) < MIN_MINUTES_BEFORE_CHANGE) {
    throw new AppError(
      'Faltam menos de 2 horas para o seu horário. Entre em contato com o estabelecimento.',
      400,
    )
  }
}

export async function getByToken(slug: string, token: string) {
  const { appointment } = await requireAppointment(slug, token)
  return { appointment: toPublicAppointment(appointment) }
}

/**
 * Envia um código de 6 dígitos por WhatsApp. A resposta é SEMPRE a mesma, exista
 * ou não o telefone na base: sem isso, o endpoint vira um enumerador de
 * clientes do estabelecimento (nome e horários são PII).
 */
export async function requestAccessCode(slug: string, rawPhone: string) {
  const establishment = await findEstablishmentBySlug(slug)
  const phone = normalizePhone(rawPhone)

  // Cooldown por telefone (o rate limit da rota é por IP, e sozinho não impede
  // usar o endpoint para floodar o WhatsApp de um número alheio).
  //
  // Consultado ANTES de saber se o cliente existe, e sempre: se só telefones
  // conhecidos tocassem o Redis, uma queda dele responderia 503 para eles e 200
  // para os desconhecidos — exatamente a distinção que este endpoint existe
  // para não fazer.
  const onCooldown = await withRedisTimeout(
    redisConnection.exists(cooldownKey(establishment.id, phone)),
  )

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.establishmentId, establishment.id), eq(clients.phone, phone)),
  })

  if (client && !client.whatsappOptOut && !onCooldown) {
    const hasUpcoming = await db.query.appointments.findFirst({
      where: and(
        eq(appointments.clientId, client.id),
        inArray(appointments.status, STATUSES_OPEN),
        gte(appointments.date, todayStr()),
      ),
      columns: { id: true },
    })

    if (hasUpcoming) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await withRedisTimeout(
        redisConnection.set(
          codeKey(establishment.id, phone),
          JSON.stringify({ hash: hashCode(code), attempts: 0 }),
          'EX',
          CODE_TTL_SECONDS,
        ),
      )
      await withRedisTimeout(
        redisConnection.set(cooldownKey(establishment.id, phone), '1', 'EX', CODE_COOLDOWN_SECONDS),
      )
      void notify(
        'manage_access_code',
        { phone },
        { establishmentName: establishment.name, code },
      )
    }
  }

  return { sent: true }
}

export async function verifyAccessCode(slug: string, rawPhone: string, code: string) {
  const establishment = await findEstablishmentBySlug(slug)
  const phone = normalizePhone(rawPhone)
  const key = codeKey(establishment.id, phone)

  const stored = await withRedisTimeout(redisConnection.get(key))
  if (!stored) throw new AppError('Código expirado ou inválido. Peça um novo.', 400)

  const { hash, attempts } = JSON.parse(stored) as { hash: string; attempts: number }
  const candidate = hashCode(code)
  const matches =
    candidate.length === hash.length &&
    timingSafeEqual(Buffer.from(candidate), Buffer.from(hash))

  if (!matches) {
    const nextAttempts = attempts + 1
    if (nextAttempts >= MAX_CODE_ATTEMPTS) {
      // Queima o código: força pedir outro em vez de deixar tentar até acertar.
      await withRedisTimeout(redisConnection.del(key))
      throw new AppError('Muitas tentativas. Peça um novo código.', 429)
    }
    // Preserva o TTL original: errar não pode renovar a validade do código.
    await withRedisTimeout(
      redisConnection.set(key, JSON.stringify({ hash, attempts: nextAttempts }), 'KEEPTTL'),
    )
    throw new AppError('Código incorreto', 400)
  }

  await withRedisTimeout(redisConnection.del(key))

  const client = await db.query.clients.findFirst({
    where: and(eq(clients.establishmentId, establishment.id), eq(clients.phone, phone)),
    columns: { id: true },
  })
  if (!client) throw new AppError('Nenhum agendamento encontrado', 404)

  const rows = await db.query.appointments.findMany({
    where: and(
      eq(appointments.clientId, client.id),
      inArray(appointments.status, STATUSES_OPEN),
      gte(appointments.date, todayStr()),
    ),
    with: appointmentWith,
    orderBy: (a, { asc }) => [asc(a.date), asc(a.startTime)],
  })

  // Só os que ainda não começaram (a query filtra por dia, não por hora).
  const upcoming = rows.filter((r) => minutesUntil(r.date, r.startTime) > 0)

  return { appointments: upcoming.map(toPublicAppointment) }
}

export async function cancelByToken(slug: string, token: string) {
  const { establishment, appointment } = await requireAppointment(slug, token)
  assertChangeable(appointment)

  await db
    .update(appointments)
    .set({ status: 'cancelled' })
    .where(eq(appointments.id, appointment.id))

  void notifyAppointmentById('appointment_cancelled', appointment.id)

  const updated = { ...appointment, status: 'cancelled' }
  return { appointment: toPublicAppointment(updated) }
}

/** Horários livres para remarcar, ignorando o horário atual do próprio cliente. */
export async function availabilityForReschedule(slug: string, token: string, date: string) {
  const { appointment } = await requireAppointment(slug, token)
  assertChangeable(appointment)

  return getAvailability(
    slug,
    {
      serviceId: appointment.serviceId,
      date,
      employeeId: appointment.employeeId,
    },
    appointment.id,
  )
}

export async function rescheduleByToken(slug: string, token: string, input: RescheduleInput) {
  const { establishment, appointment } = await requireAppointment(slug, token)
  assertChangeable(appointment)

  // Mesma barreira do booking público: dono em somente-leitura não recebe
  // movimentação nova na agenda.
  const access = await getAccessState(establishment.id, establishment)
  if (access.state === 'trial_expired') {
    throw new AppError('Este estabelecimento não está aceitando alterações no momento.', 403)
  }

  // Remarcar mantém serviço e profissional: trocar de profissional é escolher
  // outro agendamento, não editar este.
  const employee = await resolveEmployee(establishment.id, appointment.employeeId)
  const endTime = addMinutesToTime(input.startTime, appointment.service.durationMinutes)

  await assertBookableSlot({
    establishmentId: establishment.id,
    employee,
    date: input.date,
    startTime: input.startTime,
    endTime,
  })

  await db.transaction(async (tx) => {
    // Mesmo lock do booking: sem ele, dois clientes remarcando para o mesmo
    // horário passam os dois pela checagem.
    await lockEmployeeDay(tx, employee.id, input.date)

    const existing = await tx
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishment.id),
          eq(appointments.employeeId, employee.id),
          eq(appointments.date, input.date),
          ne(appointments.status, 'cancelled'),
          ne(appointments.id, appointment.id),
        ),
      )

    if (existing.some((a) => timesOverlap(input.startTime, endTime, a.startTime, a.endTime))) {
      throw new AppError('Este horário acabou de ser reservado. Escolha outro horário.', 409)
    }

    await tx
      .update(appointments)
      .set({
        date: input.date,
        startTime: input.startTime,
        endTime,
        // O horário novo merece o seu próprio lembrete de véspera.
        reminderSentAt: null,
      })
      .where(eq(appointments.id, appointment.id))
  })

  void notifyAppointmentById('appointment_confirmed', appointment.id)

  const updated = { ...appointment, date: input.date, startTime: input.startTime, endTime }
  return { appointment: toPublicAppointment(updated) }
}

/** Descadastro de WhatsApp (LGPD), a partir do link na página. */
export async function optOutByToken(slug: string, token: string) {
  const { appointment } = await requireAppointment(slug, token)
  await db
    .update(clients)
    .set({ whatsappOptOut: true })
    .where(eq(clients.id, appointment.client.id))
  return { optedOut: true }
}
