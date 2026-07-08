import { and, asc, eq, gte, isNotNull, lte, or, sql } from 'drizzle-orm'
import { db } from '../../db'
import { commissionEntries, employees, recurringExpenses, transactions } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type { CreateRecurringExpenseInput, UpdateRecurringExpenseInput } from './schemas'

const recurringExpenseColumns = {
  id: recurringExpenses.id,
  description: recurringExpenses.description,
  amountCents: recurringExpenses.amountCents,
  dayOfMonth: recurringExpenses.dayOfMonth,
  active: recurringExpenses.active,
  createdAt: recurringExpenses.createdAt,
}

const settledTransactionColumns = {
  id: transactions.id,
  description: transactions.description,
  amountCents: transactions.amountCents,
  type: transactions.type,
  date: transactions.date,
  recurringExpenseId: transactions.recurringExpenseId,
  employeeId: transactions.employeeId,
  appointmentId: transactions.appointmentId,
  createdAt: transactions.createdAt,
}

/** Último dia do mês 'YYYY-MM' (ex.: fev/2026 → 28). */
function lastDayOfMonth(month: string): number {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m, 0).getDate()
}

/** Vencimento no mês, ajustando o dia ao último dia em meses mais curtos. */
function dueDateFor(month: string, dayOfMonth: number): string {
  const day = Math.min(dayOfMonth, lastDayOfMonth(month))
  return `${month}-${String(day).padStart(2, '0')}`
}

function currentMonth(): string {
  return todayStr().slice(0, 7)
}

/**
 * Data da baixa no caixa: o vencimento, exceto quando ele ainda está no futuro
 * dentro do mês corrente — aí lança hoje, para a saída aparecer no fluxo de
 * caixa "até hoje" em vez de ficar com data futura invisível na lista.
 */
function settleDate(month: string, day: number): string {
  const due = dueDateFor(month, day)
  const today = todayStr()
  if (due > today && month === today.slice(0, 7)) return today
  return due
}

export async function listRecurringExpenses(establishmentId: string) {
  return db
    .select(recurringExpenseColumns)
    .from(recurringExpenses)
    .where(eq(recurringExpenses.establishmentId, establishmentId))
    .orderBy(asc(recurringExpenses.dayOfMonth), asc(recurringExpenses.description))
}

export async function createRecurringExpense(
  establishmentId: string,
  input: CreateRecurringExpenseInput,
) {
  const [created] = await db
    .insert(recurringExpenses)
    .values({
      establishmentId,
      description: input.description,
      amountCents: input.amountCents,
      dayOfMonth: input.dayOfMonth,
      active: input.active ?? true,
    })
    .returning(recurringExpenseColumns)
  return created
}

export async function updateRecurringExpense(
  establishmentId: string,
  id: string,
  input: UpdateRecurringExpenseInput,
) {
  const data: Partial<typeof recurringExpenses.$inferInsert> = {}
  if (input.description !== undefined) data.description = input.description
  if (input.amountCents !== undefined) data.amountCents = input.amountCents
  if (input.dayOfMonth !== undefined) data.dayOfMonth = input.dayOfMonth
  if (input.active !== undefined) data.active = input.active
  if (Object.keys(data).length === 0) throw new AppError('Nenhum dado para atualizar', 400)

  const [updated] = await db
    .update(recurringExpenses)
    .set(data)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.establishmentId, establishmentId)))
    .returning(recurringExpenseColumns)
  if (!updated) throw new AppError('Custo fixo não encontrado', 404)
  return updated
}

export async function deleteRecurringExpense(establishmentId: string, id: string) {
  const deleted = await db
    .delete(recurringExpenses)
    .where(and(eq(recurringExpenses.id, id), eq(recurringExpenses.establishmentId, establishmentId)))
    .returning({ id: recurringExpenses.id })
  if (deleted.length === 0) throw new AppError('Custo fixo não encontrado', 404)
}

interface ForecastItem {
  /** 'expense' = custo fixo manual; 'payroll' = pagamento (folha) de um profissional */
  kind: 'expense' | 'payroll'
  /** id do custo fixo ('expense') ou sintético 'employeeId:day' ('payroll') */
  id: string
  employeeId: string | null
  description: string
  amountCents: number
  dayOfMonth: number
  dueDate: string
  posted: boolean
  transactionId: string | null
  paidDate: string | null
  /** só em payroll: comissão do profissional no mês (informativo, não somado) */
  commissionCents: number | null
}

/**
 * Previsão dos custos fixos do mês: custos fixos manuais + os pagamentos de
 * folha de cada profissional (um item por dia de pagamento). Marca cada item
 * como pago quando há uma transação vinculada no mês. Nos itens de folha,
 * anexa a comissão do profissional no mês (apenas para dar noção, não entra no
 * total das saídas).
 */
export async function getForecast(establishmentId: string, month?: string) {
  const targetMonth = month ?? currentMonth()
  const monthStart = `${targetMonth}-01`
  const monthEnd = dueDateFor(targetMonth, 31)

  const [expenses, activeEmployees, postedRows, commissionRows] = await Promise.all([
    db
      .select(recurringExpenseColumns)
      .from(recurringExpenses)
      .where(
        and(
          eq(recurringExpenses.establishmentId, establishmentId),
          eq(recurringExpenses.active, true),
        ),
      ),
    db
      .select({ id: employees.id, name: employees.name, paymentDays: employees.paymentDays })
      .from(employees)
      .where(and(eq(employees.establishmentId, establishmentId), eq(employees.active, true))),
    db
      .select({
        id: transactions.id,
        recurringExpenseId: transactions.recurringExpenseId,
        employeeId: transactions.employeeId,
        payrollDay: transactions.payrollDay,
        amountCents: transactions.amountCents,
        date: transactions.date,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.establishmentId, establishmentId),
          or(isNotNull(transactions.recurringExpenseId), isNotNull(transactions.employeeId)),
          gte(transactions.date, monthStart),
          lte(transactions.date, monthEnd),
        ),
      ),
    db
      .select({
        employeeId: commissionEntries.employeeId,
        commissionCents: sql<string>`coalesce(sum(${commissionEntries.commissionCents}), 0)`,
      })
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.establishmentId, establishmentId),
          gte(commissionEntries.date, monthStart),
          lte(commissionEntries.date, monthEnd),
        ),
      )
      .groupBy(commissionEntries.employeeId),
  ])

  const postedByExpense = new Map<string, (typeof postedRows)[number]>()
  // Chave por (profissional, dia configurado) — não pela data, que pode
  // "encurtar" e colidir entre dois dias em meses mais curtos.
  const postedByPayroll = new Map<string, (typeof postedRows)[number]>()
  for (const row of postedRows) {
    if (row.recurringExpenseId) postedByExpense.set(row.recurringExpenseId, row)
    else if (row.employeeId != null && row.payrollDay != null) {
      postedByPayroll.set(`${row.employeeId}:${row.payrollDay}`, row)
    }
  }
  const commissionByEmployee = new Map(
    commissionRows.map((row) => [row.employeeId, Number(row.commissionCents)]),
  )

  const items: ForecastItem[] = []

  for (const expense of expenses) {
    const posted = postedByExpense.get(expense.id)
    items.push({
      kind: 'expense',
      id: expense.id,
      employeeId: null,
      description: expense.description,
      amountCents: posted ? posted.amountCents : expense.amountCents,
      dayOfMonth: expense.dayOfMonth,
      dueDate: dueDateFor(targetMonth, expense.dayOfMonth),
      posted: Boolean(posted),
      transactionId: posted?.id ?? null,
      paidDate: posted?.date ?? null,
      commissionCents: null,
    })
  }

  for (const employee of activeEmployees) {
    const commissionCents = commissionByEmployee.get(employee.id) ?? 0
    const validDays = (employee.paymentDays ?? []).filter((pd) => pd.amountCents > 0)
    validDays.forEach((paymentDay, index) => {
      const posted = postedByPayroll.get(`${employee.id}:${paymentDay.day}`)
      items.push({
        kind: 'payroll',
        id: `${employee.id}:${paymentDay.day}`,
        employeeId: employee.id,
        description: `Salário de ${employee.name}`,
        amountCents: posted ? posted.amountCents : paymentDay.amountCents,
        dayOfMonth: paymentDay.day,
        dueDate: dueDateFor(targetMonth, paymentDay.day),
        posted: Boolean(posted),
        transactionId: posted?.id ?? null,
        paidDate: posted?.date ?? null,
        // Comissão (informativa) só na última parcela, para não duplicar
        commissionCents: index === validDays.length - 1 ? commissionCents : null,
      })
    })
  }

  items.sort((a, b) =>
    a.dueDate === b.dueDate
      ? a.description.localeCompare(b.description)
      : a.dueDate.localeCompare(b.dueDate),
  )

  let totalCents = 0
  let postedCents = 0
  for (const item of items) {
    totalCents += item.amountCents
    if (item.posted) postedCents += item.amountCents
  }

  return {
    month: targetMonth,
    items,
    summary: {
      totalCents,
      postedCents,
      pendingCents: totalCents - postedCents,
      count: items.length,
      pendingCount: items.filter((item) => !item.posted).length,
    },
  }
}

/** "Dá baixa" num custo fixo manual do mês: gera a saída no caixa vinculada. */
export async function settle(establishmentId: string, id: string, month: string) {
  const expense = await db.query.recurringExpenses.findFirst({
    where: and(eq(recurringExpenses.id, id), eq(recurringExpenses.establishmentId, establishmentId)),
  })
  if (!expense) throw new AppError('Custo fixo não encontrado', 404)

  const monthStart = `${month}-01`
  const monthEnd = dueDateFor(month, 31)

  const existing = await db.query.transactions.findFirst({
    columns: { id: true },
    where: and(
      eq(transactions.establishmentId, establishmentId),
      eq(transactions.recurringExpenseId, id),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
    ),
  })
  if (existing) throw new AppError('Este custo fixo já foi baixado neste mês', 409)

  const [transaction] = await db
    .insert(transactions)
    .values({
      establishmentId,
      recurringExpenseId: id,
      description: expense.description,
      amountCents: expense.amountCents,
      type: 'expense',
      date: settleDate(month, expense.dayOfMonth),
    })
    .returning(settledTransactionColumns)
  return transaction
}

/** "Dá baixa" no pagamento (folha) de um profissional num dia do mês. */
export async function settlePayroll(
  establishmentId: string,
  employeeId: string,
  month: string,
  day: number,
) {
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.establishmentId, establishmentId)),
    columns: { name: true, paymentDays: true },
  })
  if (!employee) throw new AppError('Profissional não encontrado', 404)

  const paymentDay = (employee.paymentDays ?? []).find((p) => p.day === day)
  if (!paymentDay || paymentDay.amountCents <= 0) {
    throw new AppError('Dia de pagamento não configurado para este profissional', 400)
  }

  const monthStart = `${month}-01`
  const monthEnd = dueDateFor(month, 31)

  // Idempotência por (profissional, dia configurado) dentro do mês — assim dois
  // dias que "encurtam" para a mesma data continuam sendo baixas independentes.
  const existing = await db.query.transactions.findFirst({
    columns: { id: true },
    where: and(
      eq(transactions.establishmentId, establishmentId),
      eq(transactions.employeeId, employeeId),
      eq(transactions.payrollDay, day),
      gte(transactions.date, monthStart),
      lte(transactions.date, monthEnd),
    ),
  })
  if (existing) throw new AppError('Este pagamento já foi baixado neste mês', 409)

  const [transaction] = await db
    .insert(transactions)
    .values({
      establishmentId,
      employeeId,
      payrollDay: day,
      description: `Salário de ${employee.name}`,
      amountCents: paymentDay.amountCents,
      type: 'expense',
      date: settleDate(month, day),
    })
    .returning(settledTransactionColumns)
  return transaction
}
