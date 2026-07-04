import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, employees, services, transactions, workingHours } from '../../db/schema'
import { addDays, getDayOfWeek, timeToMinutes, todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type { DateRangeQuery, RevenueQuery } from './schemas'

const MAX_RANGE_DAYS = 400

/**
 * Resolve o intervalo de datas dos relatórios. Defaults: from = hoje - 29 dias,
 * to = hoje. Valida from <= to e intervalo máximo de 400 dias.
 */
function resolveDateRange(query: DateRangeQuery): { from: string; to: string } {
  const to = query.to ?? todayStr()
  const from = query.from ?? addDays(todayStr(), -29)

  if (from > to) {
    throw new AppError('Data inicial deve ser anterior ou igual à data final', 400)
  }
  if (to > addDays(from, MAX_RANGE_DAYS)) {
    throw new AppError('Intervalo máximo permitido é de 400 dias', 400)
  }

  return { from, to }
}

export async function getRevenueReport(establishmentId: string, query: RevenueQuery) {
  const { from, to } = resolveDateRange(query)

  const periodExpr =
    query.groupBy === 'month'
      ? sql<string>`to_char(${transactions.date}, 'YYYY-MM')`
      : sql<string>`${transactions.date}`

  const rows = await db
    .select({
      period: periodExpr,
      incomeCents: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'income'), 0)`,
      expenseCents: sql<string>`coalesce(sum(${transactions.amountCents}) filter (where ${transactions.type} = 'expense'), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.establishmentId, establishmentId),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(periodExpr)
    .orderBy(asc(periodExpr))

  return rows.map((row) => ({
    period: row.period,
    incomeCents: Number(row.incomeCents),
    expenseCents: Number(row.expenseCents),
  }))
}

export async function getTopServicesReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const countExpr = sql<string>`count(*)`

  const rows = await db
    .select({
      serviceId: services.id,
      name: services.name,
      count: countExpr,
      revenueCents: sql<string>`coalesce(sum(${services.priceCents}), 0)`,
    })
    .from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(
      and(
        eq(appointments.establishmentId, establishmentId),
        gte(appointments.date, from),
        lte(appointments.date, to),
        ne(appointments.status, 'cancelled'),
      ),
    )
    .groupBy(services.id, services.name)
    .orderBy(desc(countExpr))
    .limit(10)

  return rows.map((row) => ({
    serviceId: row.serviceId,
    name: row.name,
    count: Number(row.count),
    revenueCents: Number(row.revenueCents),
  }))
}

export async function getOccupancyReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const [appointmentRows, workingHoursRows, employeeCountRows] = await Promise.all([
    db
      .select({
        date: appointments.date,
        startTime: appointments.startTime,
        endTime: appointments.endTime,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishmentId),
          gte(appointments.date, from),
          lte(appointments.date, to),
          ne(appointments.status, 'cancelled'),
        ),
      ),
    db.query.workingHours.findMany({
      where: eq(workingHours.establishmentId, establishmentId),
    }),
    db
      .select({ count: sql<string>`count(*)` })
      .from(employees)
      .where(and(eq(employees.establishmentId, establishmentId), eq(employees.active, true))),
  ])

  const activeEmployees = Number(employeeCountRows[0]?.count ?? 0)

  // Minutos agendados por dia da semana (agrupamento em TypeScript)
  const bookedMinutesByDay = new Array<number>(7).fill(0)
  for (const appointment of appointmentRows) {
    const dayOfWeek = getDayOfWeek(appointment.date)
    bookedMinutesByDay[dayOfWeek] +=
      timeToMinutes(appointment.endTime) - timeToMinutes(appointment.startTime)
  }

  // Quantas vezes cada dia da semana ocorre no intervalo from..to (inclusive)
  const occurrencesByDay = new Array<number>(7).fill(0)
  for (let dateStr = from; dateStr <= to; dateStr = addDays(dateStr, 1)) {
    occurrencesByDay[getDayOfWeek(dateStr)] += 1
  }

  const workingHoursByDay = new Map(workingHoursRows.map((wh) => [wh.dayOfWeek, wh]))

  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const wh = workingHoursByDay.get(dayOfWeek)
    const dailyMinutes =
      wh && !wh.isClosed
        ? Math.max(timeToMinutes(wh.closesAt) - timeToMinutes(wh.opensAt), 0)
        : 0
    const availableMinutes = dailyMinutes * occurrencesByDay[dayOfWeek] * activeEmployees
    const bookedMinutes = bookedMinutesByDay[dayOfWeek]
    const rate =
      availableMinutes > 0 ? Math.min(Math.max(bookedMinutes / availableMinutes, 0), 1) : 0

    return { dayOfWeek, bookedMinutes, availableMinutes, rate }
  })
}
