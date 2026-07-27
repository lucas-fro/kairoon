import { and, asc, count, eq, gte, lt, lte, sum } from 'drizzle-orm'
import { db } from '../../db'
import { appointments, clients, employees, transactions, workingHours } from '../../db/schema'
import { addDays, addMonthsClamped, getDayOfWeek, timeToMinutes, todayStr } from '../../lib/datetime'
import type { AuthContext } from '../../plugins/auth'
import type { DashboardSummary } from './schemas'

function toDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = []
  let cursor = from
  while (cursor <= to) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

/** Variação percentual vs. período anterior; null sem base de comparação (período anterior zerado). */
function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

interface ApptRow {
  date: string
  status: string
  startTime: string
  endTime: string
}

function scheduledMinutesOf(rows: ApptRow[]): number {
  return rows
    .filter((r) => r.status !== 'cancelled')
    .reduce((total, r) => total + (timeToMinutes(r.endTime) - timeToMinutes(r.startTime)), 0)
}

function availableMinutesOf(
  dates: string[],
  hoursByDay: Map<number, { opensAt: string; closesAt: string; isClosed: boolean }>,
  employeesCount: number,
): number {
  let total = 0
  for (const date of dates) {
    const wh = hoursByDay.get(getDayOfWeek(date))
    if (!wh || wh.isClosed) continue
    total += (timeToMinutes(wh.closesAt) - timeToMinutes(wh.opensAt)) * employeesCount
  }
  return total
}

export async function getSummary(
  establishmentId: string,
  auth: AuthContext,
): Promise<DashboardSummary> {
  // Sem `agenda.view_all`, o dashboard vira o dashboard DAQUELE profissional:
  // agendamentos, ocupação e agenda do dia contam só o que é dele. A ocupação
  // também passa a ter denominador de uma pessoa, senão pareceria sempre vazia.
  const scope = auth.agendaScopeEmployeeId
  const scopedAppointment = scope ? eq(appointments.employeeId, scope) : undefined
  const canSeeMoney = auth.permissions.has('finance.view')
  const canSeeClients = auth.permissions.has('clients.view')

  const today = todayStr()
  const monthStart = `${today.slice(0, 7)}-01`
  // Período comparável do mês anterior: mesmo nº de dias decorridos, com clamp
  // no último dia do mês anterior: compara "maçã com maçã" (não mês parcial
  // contra mês cheio).
  const prevMonthEnd = addMonthsClamped(today, -1)
  const prevMonthStart = `${prevMonthEnd.slice(0, 7)}-01`

  const apptColumns = {
    date: appointments.date,
    status: appointments.status,
    startTime: appointments.startTime,
    endTime: appointments.endTime,
  }

  const [
    currentApptRows,
    previousApptRows,
    currentRevenueRows,
    previousRevenueRows,
    currentClientsRows,
    previousClientsRows,
    workingHoursRows,
    activeEmployeesRows,
    todayApptRows,
  ] = await Promise.all([
    db
      .select(apptColumns)
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishmentId),
          gte(appointments.date, monthStart),
          lte(appointments.date, today),
          scopedAppointment,
        ),
      ),
    db
      .select(apptColumns)
      .from(appointments)
      .where(
        and(
          eq(appointments.establishmentId, establishmentId),
          gte(appointments.date, prevMonthStart),
          lte(appointments.date, prevMonthEnd),
          scopedAppointment,
        ),
      ),
    db
      .select({ total: sum(transactions.amountCents) })
      .from(transactions)
      .where(
        and(
          eq(transactions.establishmentId, establishmentId),
          eq(transactions.type, 'income'),
          gte(transactions.date, monthStart),
          lte(transactions.date, today),
        ),
      ),
    db
      .select({ total: sum(transactions.amountCents) })
      .from(transactions)
      .where(
        and(
          eq(transactions.establishmentId, establishmentId),
          eq(transactions.type, 'income'),
          gte(transactions.date, prevMonthStart),
          lte(transactions.date, prevMonthEnd),
        ),
      ),
    // Linhas (não só a contagem): permite agrupar por dia para o gráfico.
    db
      .select({ createdAt: clients.createdAt })
      .from(clients)
      .where(
        and(
          eq(clients.establishmentId, establishmentId),
          gte(clients.createdAt, toDate(monthStart)),
          lt(clients.createdAt, toDate(addDays(today, 1))),
        ),
      ),
    db
      .select({ value: count() })
      .from(clients)
      .where(
        and(
          eq(clients.establishmentId, establishmentId),
          gte(clients.createdAt, toDate(prevMonthStart)),
          lt(clients.createdAt, toDate(addDays(prevMonthEnd, 1))),
        ),
      ),
    db.query.workingHours.findMany({ where: eq(workingHours.establishmentId, establishmentId) }),
    db
      .select({ value: count() })
      .from(employees)
      .where(and(eq(employees.establishmentId, establishmentId), eq(employees.active, true))),
    db.query.appointments.findMany({
      where: and(
        eq(appointments.establishmentId, establishmentId),
        eq(appointments.date, today),
        scopedAppointment,
      ),
      orderBy: [asc(appointments.startTime)],
      limit: 50,
      with: {
        client: { columns: { name: true } },
        service: { columns: { name: true } },
        employee: { columns: { name: true } },
      },
    }),
  ])

  // Escopado a um profissional: o denominador da ocupação é a jornada de UMA
  // pessoa, não a do estabelecimento inteiro.
  const activeEmployeesCount = scope ? 1 : Number(activeEmployeesRows[0]?.value ?? 0)
  const hoursByDay = new Map(workingHoursRows.map((row) => [row.dayOfWeek, row]))

  const revenueCents = Number(currentRevenueRows[0]?.total ?? 0)
  const prevRevenueCents = Number(previousRevenueRows[0]?.total ?? 0)

  const appointmentsCount = currentApptRows.filter((r) => r.status !== 'cancelled').length
  const prevAppointmentsCount = previousApptRows.filter((r) => r.status !== 'cancelled').length
  const completedCount = currentApptRows.filter((r) => r.status === 'completed').length

  const newClients = currentClientsRows.length
  const prevNewClients = Number(previousClientsRows[0]?.value ?? 0)

  const scheduledMinutes = scheduledMinutesOf(currentApptRows)
  const prevScheduledMinutes = scheduledMinutesOf(previousApptRows)
  const availableMinutes = availableMinutesOf(
    eachDateInRange(monthStart, today),
    hoursByDay,
    activeEmployeesCount,
  )
  const prevAvailableMinutes = availableMinutesOf(
    eachDateInRange(prevMonthStart, prevMonthEnd),
    hoursByDay,
    activeEmployeesCount,
  )
  const occupancyRate = availableMinutes > 0 ? Math.min(scheduledMinutes / availableMinutes, 1) : 0
  const prevOccupancyRate =
    prevAvailableMinutes > 0 ? Math.min(prevScheduledMinutes / prevAvailableMinutes, 1) : 0

  const todayScheduledMinutes = scheduledMinutesOf(currentApptRows.filter((r) => r.date === today))
  const todayAvailableMinutes = availableMinutesOf([today], hoursByDay, activeEmployeesCount)
  const todayOccupancyRate =
    todayAvailableMinutes > 0 ? Math.min(todayScheduledMinutes / todayAvailableMinutes, 1) : 0

  // Série diária do mês (agendamentos e novos clientes): dado de clientes/
  // atividade para o gráfico, não financeiro.
  const apptCountByDate = new Map<string, number>()
  for (const row of currentApptRows) {
    if (row.status === 'cancelled') continue
    apptCountByDate.set(row.date, (apptCountByDate.get(row.date) ?? 0) + 1)
  }
  const clientCountByDate = new Map<string, number>()
  for (const row of currentClientsRows) {
    const date = row.createdAt.toISOString().slice(0, 10)
    clientCountByDate.set(date, (clientCountByDate.get(date) ?? 0) + 1)
  }
  const trend = eachDateInRange(monthStart, today).map((date) => ({
    date,
    appointmentsCount: apptCountByDate.get(date) ?? 0,
    newClientsCount: canSeeClients ? (clientCountByDate.get(date) ?? 0) : 0,
  }))

  return {
    month: {
      // Dinheiro e carteira de clientes só para quem tem a permissão. O
      // dashboard não é barrado inteiro porque é a página inicial de todos:
      // null aqui vira "cartão não aparece" na tela.
      revenueCents: canSeeMoney ? revenueCents : null,
      revenueChangePct: canSeeMoney ? pctChange(revenueCents, prevRevenueCents) : null,
      completedCount,
      appointmentsCount,
      appointmentsChangePct: pctChange(appointmentsCount, prevAppointmentsCount),
      newClients: canSeeClients ? newClients : null,
      newClientsChangePct: canSeeClients ? pctChange(newClients, prevNewClients) : null,
      occupancyRate,
      occupancyChangePct: pctChange(occupancyRate, prevOccupancyRate),
      todayOccupancyRate,
    },
    trend,
    // Dia inteiro (qualquer status): concluído/cancelado permanece visível em
    // vez de sumir, com o status indicado na tabela.
    todayAppointments: todayApptRows.map((appointment) => ({
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
