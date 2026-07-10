import { and, asc, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import { db } from '../../db'
import {
  appointments,
  clients,
  employees,
  services,
  transactions,
  workingHours,
} from '../../db/schema'
import { addDays, getDayOfWeek, timeToMinutes, todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type { DateRangeQuery, GroupedQuery, RevenueQuery, TopServicesQuery } from './schemas'

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

export async function getTopServicesReport(establishmentId: string, query: TopServicesQuery) {
  const { from, to } = resolveDateRange(query)

  const countExpr = sql<string>`count(*)`
  const revenueExpr = sql<string>`coalesce(sum(${services.priceCents}), 0)`
  const orderExpr = query.sort === 'revenue' ? revenueExpr : countExpr

  const rows = await db
    .select({
      serviceId: services.id,
      name: services.name,
      count: countExpr,
      revenueCents: revenueExpr,
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
    .orderBy(desc(orderExpr))
    .limit(10)

  return rows.map((row) => ({
    serviceId: row.serviceId,
    name: row.name,
    count: Number(row.count),
    revenueCents: Number(row.revenueCents),
  }))
}

/**
 * Total recebido por método de pagamento (dinheiro, pix, débito, crédito).
 * Fonte: o snapshot `payments` dos atendimentos concluídos no período — é o
 * único lugar com o dinheiro discriminado por método.
 */
export async function getPaymentMethodsReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const rows = await db
    .select({ payments: appointments.payments })
    .from(appointments)
    .where(
      and(
        eq(appointments.establishmentId, establishmentId),
        gte(appointments.date, from),
        lte(appointments.date, to),
        eq(appointments.status, 'completed'),
      ),
    )

  const totals: Record<'cash' | 'pix' | 'debit' | 'credit', number> = {
    cash: 0,
    pix: 0,
    debit: 0,
    credit: 0,
  }
  for (const row of rows) {
    for (const payment of row.payments ?? []) {
      totals[payment.method] += payment.amountCents
    }
  }

  return (['cash', 'pix', 'debit', 'credit'] as const).map((method) => ({
    method,
    amountCents: totals[method],
  }))
}

/**
 * Clientes que mais gastam: faturamento líquido acumulado por cliente. Usa as
 * receitas do caixa (transactions type=income) atreladas a atendimentos, de
 * modo que estornos (reabertura apaga a receita) já entram descontados.
 */
export async function getTopClientsReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const revenueExpr = sql<string>`coalesce(sum(${transactions.amountCents}), 0)`

  const rows = await db
    .select({
      clientId: clients.id,
      name: clients.name,
      revenueCents: revenueExpr,
    })
    .from(transactions)
    .innerJoin(appointments, eq(transactions.appointmentId, appointments.id))
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .where(
      and(
        eq(transactions.establishmentId, establishmentId),
        eq(transactions.type, 'income'),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(clients.id, clients.name)
    .orderBy(desc(revenueExpr))
    .limit(10)

  return rows.map((row) => ({
    clientId: row.clientId,
    name: row.name,
    revenueCents: Number(row.revenueCents),
  }))
}

/** Faturamento por recurso: receita bruta (sem comissão) gerada por profissional. */
export async function getRevenueByEmployeeReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const revenueExpr = sql<string>`coalesce(sum(${transactions.amountCents}), 0)`

  const rows = await db
    .select({
      employeeId: employees.id,
      name: employees.name,
      revenueCents: revenueExpr,
    })
    .from(transactions)
    .innerJoin(appointments, eq(transactions.appointmentId, appointments.id))
    .innerJoin(employees, eq(appointments.employeeId, employees.id))
    .where(
      and(
        eq(transactions.establishmentId, establishmentId),
        eq(transactions.type, 'income'),
        gte(transactions.date, from),
        lte(transactions.date, to),
      ),
    )
    .groupBy(employees.id, employees.name)
    .orderBy(desc(revenueExpr))
    .limit(10)

  return rows.map((row) => ({
    employeeId: row.employeeId,
    name: row.name,
    revenueCents: Number(row.revenueCents),
  }))
}

/** Novos clientes cadastrados por período (dia ou mês). */
export async function getNewClientsReport(establishmentId: string, query: GroupedQuery) {
  const { from, to } = resolveDateRange(query)

  const periodExpr =
    query.groupBy === 'month'
      ? sql<string>`to_char(${clients.createdAt}, 'YYYY-MM')`
      : sql<string>`(${clients.createdAt}::date)::text`

  const rows = await db
    .select({
      period: periodExpr,
      count: sql<string>`count(*)`,
    })
    .from(clients)
    .where(
      and(
        eq(clients.establishmentId, establishmentId),
        sql`${clients.createdAt}::date >= ${from}`,
        sql`${clients.createdAt}::date <= ${to}`,
      ),
    )
    .groupBy(periodExpr)
    .orderBy(asc(periodExpr))

  return rows.map((row) => ({ period: row.period, count: Number(row.count) }))
}

/** Volume de agendamentos por período e status (pivotado por status). */
export async function getAppointmentsByStatusReport(establishmentId: string, query: GroupedQuery) {
  const { from, to } = resolveDateRange(query)

  const periodExpr =
    query.groupBy === 'month'
      ? sql<string>`to_char(${appointments.date}, 'YYYY-MM')`
      : sql<string>`${appointments.date}`

  const rows = await db
    .select({
      period: periodExpr,
      status: appointments.status,
      count: sql<string>`count(*)`,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.establishmentId, establishmentId),
        gte(appointments.date, from),
        lte(appointments.date, to),
      ),
    )
    .groupBy(periodExpr, appointments.status)
    .orderBy(asc(periodExpr))

  const byPeriod = new Map<
    string,
    { period: string; confirmed: number; pending: number; completed: number; cancelled: number }
  >()
  for (const row of rows) {
    const bucket =
      byPeriod.get(row.period) ??
      { period: row.period, confirmed: 0, pending: 0, completed: 0, cancelled: 0 }
    bucket[row.status] = Number(row.count)
    byPeriod.set(row.period, bucket)
  }

  return Array.from(byPeriod.values()).sort((a, b) => a.period.localeCompare(b.period))
}

/** Horários mais movimentados: contagem de agendamentos por dia da semana e hora. */
export async function getBusyHoursReport(establishmentId: string, query: DateRangeQuery) {
  const { from, to } = resolveDateRange(query)

  const rows = await db
    .select({ date: appointments.date, startTime: appointments.startTime })
    .from(appointments)
    .where(
      and(
        eq(appointments.establishmentId, establishmentId),
        gte(appointments.date, from),
        lte(appointments.date, to),
        ne(appointments.status, 'cancelled'),
      ),
    )

  // Matriz [dia da semana 0..6][hora 0..23] agregada em TypeScript.
  const cells = new Map<string, { dayOfWeek: number; hour: number; count: number }>()
  for (const row of rows) {
    const dayOfWeek = getDayOfWeek(row.date)
    const hour = Number(row.startTime.slice(0, 2))
    if (Number.isNaN(hour)) continue
    const key = `${dayOfWeek}-${hour}`
    const cell = cells.get(key) ?? { dayOfWeek, hour, count: 0 }
    cell.count += 1
    cells.set(key, cell)
  }

  return Array.from(cells.values())
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
