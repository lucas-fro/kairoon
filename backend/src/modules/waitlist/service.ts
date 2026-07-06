import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients, employees, services, waitlistEntries } from '../../db/schema'
import { addMinutesToTime, todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { assertNoConflict, getAppointment } from '../appointments/service'
import type { CreateWaitlistInput, ListWaitlistQuery, PromoteWaitlistInput } from './schemas'

const joinedWith = {
  client: { columns: { id: true, name: true, phone: true } },
  service: { columns: { id: true, name: true, durationMinutes: true, priceCents: true } },
  preferredEmployee: { columns: { id: true, name: true } },
} as const

export async function listWaitlist(establishmentId: string, query: ListWaitlistQuery) {
  const conditions = [eq(waitlistEntries.establishmentId, establishmentId)]
  conditions.push(eq(waitlistEntries.status, query.status ?? 'waiting'))
  if (query.date) conditions.push(eq(waitlistEntries.targetDate, query.date))

  const rows = await db.query.waitlistEntries.findMany({
    where: and(...conditions),
    with: joinedWith,
    orderBy: [asc(waitlistEntries.targetDate), asc(waitlistEntries.createdAt)],
  })

  return rows.map((row) => ({
    id: row.id,
    targetDate: row.targetDate,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt,
    client: row.client,
    service: row.service,
    preferredEmployee: row.preferredEmployee,
  }))
}

export async function createWaitlistEntry(establishmentId: string, input: CreateWaitlistInput) {
  const client = await db.query.clients.findFirst({
    where: and(eq(clients.id, input.clientId), eq(clients.establishmentId, establishmentId)),
  })
  if (!client) throw new AppError('Cliente não encontrado', 404)

  const service = await db.query.services.findFirst({
    where: and(eq(services.id, input.serviceId), eq(services.establishmentId, establishmentId)),
  })
  if (!service) throw new AppError('Serviço não encontrado', 404)

  if (input.preferredEmployeeId) {
    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.id, input.preferredEmployeeId),
        eq(employees.establishmentId, establishmentId),
      ),
    })
    if (!employee) throw new AppError('Profissional não encontrado', 404)
  }

  const [entry] = await db
    .insert(waitlistEntries)
    .values({
      establishmentId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      preferredEmployeeId: input.preferredEmployeeId ?? null,
      targetDate: input.targetDate ?? todayStr(),
      note: input.note?.trim() || null,
    })
    .returning()

  return entry
}

export async function deleteWaitlistEntry(establishmentId: string, id: string) {
  const [deleted] = await db
    .delete(waitlistEntries)
    .where(and(eq(waitlistEntries.id, id), eq(waitlistEntries.establishmentId, establishmentId)))
    .returning({ id: waitlistEntries.id })
  if (!deleted) throw new AppError('Item da fila não encontrado', 404)
}

export async function promoteWaitlistEntry(
  establishmentId: string,
  id: string,
  input: PromoteWaitlistInput,
) {
  const entry = await db.query.waitlistEntries.findFirst({
    where: and(eq(waitlistEntries.id, id), eq(waitlistEntries.establishmentId, establishmentId)),
  })
  if (!entry) throw new AppError('Item da fila não encontrado', 404)
  if (entry.status !== 'waiting') throw new AppError('Este item já foi encaixado', 409)

  const employeeId = input.employeeId ?? entry.preferredEmployeeId
  if (!employeeId) throw new AppError('Escolha o profissional para encaixar', 400)

  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.establishmentId, establishmentId)),
  })
  if (!employee) throw new AppError('Profissional não encontrado', 404)

  const service = await db.query.services.findFirst({
    where: and(eq(services.id, entry.serviceId), eq(services.establishmentId, establishmentId)),
  })
  if (!service) throw new AppError('Serviço não encontrado', 404)

  const endTime = addMinutesToTime(input.startTime, service.durationMinutes)

  const appointmentId = await db.transaction(async (tx) => {
    await assertNoConflict(tx, {
      establishmentId,
      employeeId,
      date: entry.targetDate,
      startTime: input.startTime,
      endTime,
    })

    const [appointment] = await tx
      .insert(appointments)
      .values({
        establishmentId,
        clientId: entry.clientId,
        serviceId: entry.serviceId,
        employeeId,
        date: entry.targetDate,
        startTime: input.startTime,
        endTime,
        status: 'confirmed',
        createdVia: 'panel',
      })
      .returning({ id: appointments.id })

    // Guard da transição: só promove se ainda estiver 'waiting'. Um encaixe
    // concorrente que perca a corrida vê 0 linhas e faz rollback (sem duplicar).
    const updated = await tx
      .update(waitlistEntries)
      .set({ status: 'scheduled', scheduledAppointmentId: appointment.id })
      .where(
        and(
          eq(waitlistEntries.id, id),
          eq(waitlistEntries.establishmentId, establishmentId),
          eq(waitlistEntries.status, 'waiting'),
        ),
      )
      .returning({ id: waitlistEntries.id })
    if (updated.length === 0) throw new AppError('Este item já foi encaixado', 409)

    return appointment.id
  })

  return getAppointment(establishmentId, appointmentId)
}
