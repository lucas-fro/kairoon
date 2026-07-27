import { Worker } from 'bullmq'
import { and, gte, inArray, isNull, lte } from 'drizzle-orm'
import { db } from '../db'
import { appointments } from '../db/schema'
import { addDays, minutesUntil, todayStr } from '../lib/datetime'
import { getAccessState } from '../lib/plan'
import { redisConnection } from '../lib/redis'
import { notifyAppointment } from '../notifications/appointment'
import { hasActiveChannel } from '../notifications/dispatcher'

/**
 * Varredura periódica que dispara o lembrete de véspera.
 *
 * A janela é `agora+2h .. agora+24h`, e não "exatamente 24h antes", porque é
 * auto-curativa: se o worker ficou fora 40 minutos, o lembrete atrasado ainda
 * sai na varredura seguinte em vez de se perder para sempre. O piso de 2h evita
 * mandar "amanhã às..." para quem agendou para daqui a 30 minutos.
 *
 * Quem reservou EM CIMA DA HORA não recebe lembrete nenhum: ver
 * `bookedWithEnoughNotice` abaixo.
 *
 * A garantia de "no máximo um lembrete" NÃO vem da janela: vem do carimbo
 * `reminderSentAt`, gravado pelo worker de WhatsApp só após a entrega.
 */

const MIN_MINUTES_AHEAD = 2 * 60
const MAX_MINUTES_AHEAD = 24 * 60

/**
 * O lembrete de véspera só faz sentido para quem marcou com pelo menos um dia
 * de antecedência. Quem reservou para daqui a poucas horas acabou de escolher o
 * horário na tela e já recebeu a confirmação: um "lembrete" logo em seguida é
 * ruído, e ainda diria "amanhã" para algo que é hoje.
 *
 * A antecedência é medida no momento da RESERVA (`createdAt`), não agora.
 */
function bookedWithEnoughNotice(appointment: {
  date: string
  startTime: string
  createdAt: Date
}): boolean {
  return (
    minutesUntil(appointment.date, appointment.startTime, appointment.createdAt) >
    MAX_MINUTES_AHEAD
  )
}

export async function runReminderScan(): Promise<number> {
  // Nenhum canal ativo para lembrete: sair antes de varrer a agenda. Pergunta
  // pelo TIPO, não pelo WhatsApp: hoje o e-mail sustenta o lembrete sozinho
  // enquanto o WhatsApp está desligado.
  if (!hasActiveChannel('appointment_reminder')) return 0

  const now = new Date()
  const today = todayStr()

  // Pré-filtro barato no banco (por data, que é indexada junto do
  // establishmentId); a janela fina é calculada em JS porque `date` e
  // `startTime` são colunas separadas em hora local — fazer essa aritmética em
  // SQL cairia na armadilha de UTC que lib/datetime.ts avisa para evitar.
  const candidates = await db.query.appointments.findMany({
    where: and(
      gte(appointments.date, today),
      lte(appointments.date, addDays(today, 2)),
      inArray(appointments.status, ['confirmed', 'pending']),
      isNull(appointments.reminderSentAt),
    ),
    with: {
      client: { columns: { name: true, phone: true, email: true, whatsappOptOut: true } },
      service: { columns: { name: true, priceCents: true } },
      employee: { columns: { name: true } },
      establishment: {
        columns: {
          id: true,
          name: true,
          slug: true,
          notifyWhatsapp: true,
          plan: true,
          trialEndsAt: true,
        },
      },
    },
  })

  const due = candidates.filter((a) => {
    // O interruptor do dono desliga o lembrete inteiro, em qualquer canal: ele
    // pediu para não lembrar, não para "não lembrar por WhatsApp".
    if (!a.establishment.notifyWhatsapp) return false
    if (!bookedWithEnoughNotice(a)) return false
    const minutes = minutesUntil(a.date, a.startTime, now)
    return minutes >= MIN_MINUTES_AHEAD && minutes <= MAX_MINUTES_AHEAD
  })

  // Conta somente-leitura (teste vencido sem assinatura) não dispara nada: ela
  // nem aceita agendamento novo. Cacheado por estabelecimento para não repetir a
  // consulta por agendamento.
  //
  // O gate de PLANO não está aqui: quem decide canal a canal é o
  // `notifyAppointment`, que corta só o WhatsApp fora do Essencial e deixa o
  // e-mail passar. Duplicar a regra aqui tiraria o lembrete por e-mail do Básico.
  const allowedCache = new Map<string, boolean>()
  let sent = 0

  for (const appointment of due) {
    const est = appointment.establishment
    let allowed = allowedCache.get(est.id)
    if (allowed === undefined) {
      const access = await getAccessState(est.id, est)
      allowed = access.state !== 'trial_expired'
      allowedCache.set(est.id, allowed)
    }
    if (!allowed) continue

    // Reusa o mesmo montador dos outros produtores: opt-out do cliente, gate de
    // plano por canal e link de gerenciamento saem de graça e não divergem.
    await notifyAppointment('appointment_reminder', {
      appointmentId: appointment.id,
      date: appointment.date,
      startTime: appointment.startTime,
      client: appointment.client,
      service: appointment.service,
      employee: appointment.employee,
      establishment: est,
    })
    sent += 1
  }

  return sent
}

export function createSchedulerWorker() {
  const worker = new Worker(
    'scheduler',
    async () => {
      const sent = await runReminderScan()
      if (sent > 0) console.log(`[scheduler] ${sent} lembrete(s) enfileirado(s)`)
    },
    { connection: redisConnection, concurrency: 1 },
  )

  worker.on('failed', (job, err) => console.error(`[scheduler] job ${job?.id} falhou:`, err.message))
  worker.on('error', (err) => console.error('[scheduler] error:', err))
  return worker
}
