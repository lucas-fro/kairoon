import { and, asc, desc, eq, ilike, like, ne, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients, employees, services } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { normalizePhone } from '../../lib/slots'
import type { CreateClientInput, UpdateClientInput } from './schemas'

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
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(employees, eq(employees.id, appointments.employeeId))
    .where(and(eq(appointments.clientId, id), eq(appointments.establishmentId, establishmentId)))
    .orderBy(desc(appointments.date), desc(appointments.startTime))

  const today = todayStr()
  const nonCancelled = history.filter((a) => a.status !== 'cancelled')
  const stats = {
    appointmentsCount: nonCancelled.length,
    totalSpentCents: history
      .filter((a) => a.status === 'completed')
      .reduce((total, a) => total + a.priceCents, 0),
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
