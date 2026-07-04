import { and, asc, count, eq, gte, lte, ne, sum } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients, employees, transactions, workingHours } from '../../db/schema'
import {
  getDayOfWeek,
  minutesToTime,
  nowMinutes,
  timeToMinutes,
  todayStr,
} from '../../lib/datetime'
import type { DashboardSummary } from './schemas'

export async function getSummary(establishmentId: string): Promise<DashboardSummary> {
  const today = todayStr()
  const monthStartStr = `${today.slice(0, 7)}-01`
  const [year, month] = today.split('-').map(Number)
  const monthStartDate = new Date(year, month - 1, 1)
  const dayOfWeek = getDayOfWeek(today)
  const currentTime = minutesToTime(nowMinutes())

  const [
    todayAppointmentsRows,
    todayRevenueRows,
    monthRevenueRows,
    newClientsRows,
    todayWorkingHours,
    activeEmployeesRows,
    nextAppointmentsRows,
  ] = await Promise.all([
    db
      .select({ startTime: appointments.startTime, endTime: appointments.endTime })
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishmentId),
          eq(appointments.date, today),
          ne(appointments.status, 'cancelled'),
        ),
      ),
    db
      .select({ total: sum(transactions.amountCents) })
      .from(transactions)
      .where(
        and(
          eq(transactions.establishmentId, establishmentId),
          eq(transactions.type, 'income'),
          eq(transactions.date, today),
        ),
      ),
    db
      .select({ total: sum(transactions.amountCents) })
      .from(transactions)
      .where(
        and(
          eq(transactions.establishmentId, establishmentId),
          eq(transactions.type, 'income'),
          gte(transactions.date, monthStartStr),
          lte(transactions.date, today),
        ),
      ),
    db
      .select({ value: count() })
      .from(clients)
      .where(
        and(eq(clients.establishmentId, establishmentId), gte(clients.createdAt, monthStartDate)),
      ),
    db.query.workingHours.findFirst({
      where: and(
        eq(workingHours.establishmentId, establishmentId),
        eq(workingHours.dayOfWeek, dayOfWeek),
      ),
    }),
    db
      .select({ value: count() })
      .from(employees)
      .where(and(eq(employees.establishmentId, establishmentId), eq(employees.active, true))),
    db.query.appointments.findMany({
      where: and(
        eq(appointments.establishmentId, establishmentId),
        eq(appointments.date, today),
        eq(appointments.status, 'confirmed'),
        gte(appointments.startTime, currentTime),
      ),
      orderBy: [asc(appointments.startTime)],
      limit: 8,
      with: {
        client: { columns: { name: true } },
        service: { columns: { name: true } },
        employee: { columns: { name: true } },
      },
    }),
  ])

  const todayRevenueCents = Number(todayRevenueRows[0]?.total ?? 0)
  const monthRevenueCents = Number(monthRevenueRows[0]?.total ?? 0)
  const newClientsThisMonth = Number(newClientsRows[0]?.value ?? 0)
  const activeEmployeesCount = Number(activeEmployeesRows[0]?.value ?? 0)

  const scheduledMinutesToday = todayAppointmentsRows.reduce(
    (total, appointment) =>
      total + (timeToMinutes(appointment.endTime) - timeToMinutes(appointment.startTime)),
    0,
  )

  let occupancyRate = 0
  if (todayWorkingHours && !todayWorkingHours.isClosed && activeEmployeesCount > 0) {
    const minutesPerEmployee =
      timeToMinutes(todayWorkingHours.closesAt) - timeToMinutes(todayWorkingHours.opensAt)
    const availableMinutesToday = minutesPerEmployee * activeEmployeesCount
    if (availableMinutesToday > 0) {
      occupancyRate = Math.min(scheduledMinutesToday / availableMinutesToday, 1)
    }
  }

  return {
    todayAppointments: todayAppointmentsRows.length,
    todayRevenueCents,
    monthRevenueCents,
    newClientsThisMonth,
    occupancyRate,
    nextAppointments: nextAppointmentsRows.map((appointment) => ({
      id: appointment.id,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      clientName: appointment.client.name,
      serviceName: appointment.service.name,
      employeeName: appointment.employee.name,
    })),
  }
}
