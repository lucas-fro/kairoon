import { and, asc, desc, eq, ilike, isNotNull, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients, employees, services } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { normalizePhone } from '../../lib/slots'
import type { CreateClientInput, UpdateClientInput } from './schemas'

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Meia-noite local de uma data 'YYYY-MM-DD' (nunca faz parse UTC). */
function localDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Dias inteiros de `from` até `to` (ambos 'YYYY-MM-DD'); robusto a DST. */
function daysBetween(from: string, to: string): number {
  return Math.round((localDate(to).getTime() - localDate(from).getTime()) / 86_400_000)
}

/**
 * Proximidade do próximo aniversário a partir de `today` e a idade que a pessoa
 * completa nele. 29/02 é comemorado em 28/02 nos anos não bissextos.
 */
function birthdayInfo(birthDate: string, today: string): { daysUntil: number; turningAge: number } {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  const todayDate = localDate(today)
  const todayYear = todayDate.getFullYear()

  const occurrence = (year: number): Date => {
    const day = birthMonth === 2 && birthDay === 29 && !isLeapYear(year) ? 28 : birthDay
    return new Date(year, birthMonth - 1, day)
  }

  let next = occurrence(todayYear)
  if (next.getTime() < todayDate.getTime()) next = occurrence(todayYear + 1)

  return {
    daysUntil: Math.round((next.getTime() - todayDate.getTime()) / 86_400_000),
    turningAge: next.getFullYear() - birthYear,
  }
}

function isUniqueViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23505' || error.cause?.code === '23505'
}

export async function listClients(establishmentId: string, search?: string) {
  const today = todayStr()

  const filters = [eq(clients.establishmentId, establishmentId)]
  if (search) {
    const digits = normalizePhone(search)
    const nameFilter = ilike(clients.name, `%${search}%`)
    const searchFilter =
      digits.length > 0 ? or(nameFilter, like(clients.phone, `%${digits}%`)) : nameFilter
    if (searchFilter) filters.push(searchFilter)
  }

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      birthDate: clients.birthDate,
      createdAt: clients.createdAt,
      appointmentsCount: sql<string>`count(${appointments.id}) filter (where ${appointments.status} <> 'cancelled')`,
      lastVisit: sql<string | null>`max(${appointments.date}) filter (where ${appointments.status} <> 'cancelled' and ${appointments.date} <= ${today})`,
      totalSpentCents: sql<string>`coalesce(sum(${services.priceCents}) filter (where ${appointments.status} = 'completed'), 0)`,
    })
    .from(clients)
    .leftJoin(appointments, eq(appointments.clientId, clients.id))
    .leftJoin(services, eq(services.id, appointments.serviceId))
    .where(and(...filters))
    .groupBy(clients.id)
    .orderBy(asc(clients.name))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    birthDate: row.birthDate,
    createdAt: row.createdAt,
    appointmentsCount: Number(row.appointmentsCount),
    lastVisit: row.lastVisit,
    totalSpentCents: Number(row.totalSpentCents),
  }))
}

/**
 * Aniversariantes do estabelecimento, ordenados pela proximidade do próximo
 * aniversário (quem faz hoje primeiro). Só clientes com data de nascimento.
 */
export async function listBirthdays(establishmentId: string) {
  const today = todayStr()

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      birthDate: clients.birthDate,
      appointmentsCount: sql<string>`count(${appointments.id}) filter (where ${appointments.status} <> 'cancelled')`,
      lastVisit: sql<string | null>`max(${appointments.date}) filter (where ${appointments.status} <> 'cancelled' and ${appointments.date} <= ${today})`,
    })
    .from(clients)
    .leftJoin(appointments, eq(appointments.clientId, clients.id))
    .where(and(eq(clients.establishmentId, establishmentId), isNotNull(clients.birthDate)))
    .groupBy(clients.id)

  return rows
    .map((row) => {
      // birthDate é not-null aqui (filtro isNotNull), mas o tipo é string | null.
      const { daysUntil, turningAge } = birthdayInfo(row.birthDate as string, today)
      return {
        id: row.id,
        name: row.name,
        phone: row.phone,
        birthDate: row.birthDate as string,
        appointmentsCount: Number(row.appointmentsCount),
        lastVisit: row.lastVisit,
        daysUntil,
        isToday: daysUntil === 0,
        turningAge,
      }
    })
    .sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Clientes "sumidos": já vieram ao menos uma vez, mas há pelo menos `minDays`
 * dias não retornam. Ordenados do mais ausente para o menos ausente.
 */
export async function listLapsed(establishmentId: string, minDays = 30) {
  const today = todayStr()

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      phone: clients.phone,
      appointmentsCount: sql<string>`count(${appointments.id}) filter (where ${appointments.status} <> 'cancelled')`,
      lastVisit: sql<string | null>`max(${appointments.date}) filter (where ${appointments.status} <> 'cancelled' and ${appointments.date} <= ${today})`,
      totalSpentCents: sql<string>`coalesce(sum(${services.priceCents}) filter (where ${appointments.status} = 'completed'), 0)`,
    })
    .from(clients)
    .leftJoin(appointments, eq(appointments.clientId, clients.id))
    .leftJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(clients.establishmentId, establishmentId))
    .groupBy(clients.id)

  return rows
    .flatMap((row) => {
      // Nunca veio (sem visita concluída/agendada até hoje) não é "sumido".
      if (row.lastVisit === null) return []
      const daysSince = daysBetween(row.lastVisit, today)
      if (daysSince < minDays) return []
      return [
        {
          id: row.id,
          name: row.name,
          phone: row.phone,
          appointmentsCount: Number(row.appointmentsCount),
          lastVisit: row.lastVisit,
          daysSince,
          totalSpentCents: Number(row.totalSpentCents),
        },
      ]
    })
    .sort((a, b) => b.daysSince - a.daysSince || a.name.localeCompare(b.name, 'pt-BR'))
}

export async function getClientDetails(establishmentId: string, id: string) {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, id), eq(clients.establishmentId, establishmentId)),
  })
  if (!client) throw new AppError('Cliente não encontrado', 404)

  const history = await db
    .select({
      id: appointments.id,
      date: appointments.date,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      createdVia: appointments.createdVia,
      serviceName: services.name,
      priceCents: services.priceCents,
      employeeName: employees.name,
      debtCents: appointments.debtCents,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(employees, eq(employees.id, appointments.employeeId))
    .where(and(eq(appointments.clientId, id), eq(appointments.establishmentId, establishmentId)))
    .orderBy(desc(appointments.date), desc(appointments.startTime))

  const today = todayStr()
  const nonCancelled = history.filter((a) => a.status !== 'cancelled')
  const completed = history.filter((a) => a.status === 'completed')
  const stats = {
    appointmentsCount: nonCancelled.length,
    totalSpentCents: completed.reduce((total, a) => total + a.priceCents, 0),
    // Saldo devedor atual do cliente: soma (com sinal) do efeito de cada
    // fechamento. Nunca negativo (uma gorjeta não vira crédito a favor).
    outstandingDebtCents: Math.max(0, completed.reduce((total, a) => total + a.debtCents, 0)),
    // history está ordenado por date desc: a primeira visita não-cancelada até hoje é a mais recente
    lastVisit: nonCancelled.find((a) => a.date <= today)?.date ?? null,
  }

  return { client, stats, history }
}

async function assertPhoneAvailable(establishmentId: string, phone: string, excludeId?: string) {
  const filters = [eq(clients.establishmentId, establishmentId), eq(clients.phone, phone)]
  if (excludeId) filters.push(ne(clients.id, excludeId))

  const existing = await db.query.clients.findFirst({ where: and(...filters) })
  if (existing) throw new AppError('Já existe um cliente com este telefone', 409)
}

export async function createClient(establishmentId: string, input: CreateClientInput) {
  await assertPhoneAvailable(establishmentId, input.phone)

  try {
    const [client] = await db
      .insert(clients)
      .values({
        establishmentId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        birthDate: input.birthDate,
        gender: input.gender,
      })
      .returning()
    return client
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('Já existe um cliente com este telefone', 409)
    }
    throw err
  }
}

export async function updateClient(establishmentId: string, id: string, input: UpdateClientInput) {
  if (Object.keys(input).length === 0) {
    throw new AppError('Informe ao menos um campo para atualizar', 400)
  }

  if (input.phone !== undefined) {
    await assertPhoneAvailable(establishmentId, input.phone, id)
  }

  try {
    const [updated] = await db
      .update(clients)
      .set(input)
      .where(and(eq(clients.id, id), eq(clients.establishmentId, establishmentId)))
      .returning()
    if (!updated) throw new AppError('Cliente não encontrado', 404)
    return updated
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('Já existe um cliente com este telefone', 409)
    }
    throw err
  }
}
