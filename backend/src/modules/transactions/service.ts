import { and, desc, eq, gt, gte, isNotNull, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { transactions } from '../../db/schema'
import { endOfMonth, todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type { CreateTransactionInput, ListTransactionsQuery } from './schemas'

export async function listTransactions(establishmentId: string, query: ListTransactionsQuery) {
  const today = todayStr()
  const from = query.from ?? `${today.slice(0, 8)}01`
  const to = query.to ?? today

  if (from > to) throw new AppError('Data inicial não pode ser maior que a data final', 400)

  const rows = await db.query.transactions.findMany({
    columns: {
      id: true,
      description: true,
      amountCents: true,
      type: true,
      date: true,
      appointmentId: true,
      recurringExpenseId: true,
      employeeId: true,
      payrollDay: true,
      installmentNumber: true,
      installmentTotal: true,
      createdAt: true,
    },
    // Formas de pagamento (e parcelamento) vivem no fechamento do agendamento.
    with: { appointment: { columns: { payments: true } } },
    where: and(
      eq(transactions.establishmentId, establishmentId),
      gte(transactions.date, from),
      lte(transactions.date, to),
      query.type ? eq(transactions.type, query.type) : undefined,
    ),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
  })

  let incomeCents = 0
  let expenseCents = 0
  for (const row of rows) {
    if (row.type === 'income') incomeCents += row.amountCents
    else expenseCents += row.amountCents
  }

  // Contas a receber: parcelas de crédito ainda não vencidas (date > hoje),
  // independentes do período filtrado — olham o futuro. "Este mês" = as que
  // ainda vencem até o fim do mês corrente.
  const sumAmount = sql<string>`coalesce(sum(${transactions.amountCents}), 0)`
  const receivableWhere = and(
    eq(transactions.establishmentId, establishmentId),
    eq(transactions.type, 'income'),
    isNotNull(transactions.installmentTotal),
    gt(transactions.date, today),
  )
  const [[total], [thisMonth]] = await Promise.all([
    db.select({ v: sumAmount }).from(transactions).where(receivableWhere),
    db
      .select({ v: sumAmount })
      .from(transactions)
      .where(and(receivableWhere, lte(transactions.date, endOfMonth(today)))),
  ])

  return {
    transactions: rows.map(({ appointment, ...t }) => ({
      ...t,
      payments: appointment?.payments ?? null,
    })),
    summary: {
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
      receivableThisMonthCents: Number(thisMonth?.v ?? 0),
      receivableTotalCents: Number(total?.v ?? 0),
    },
  }
}

export async function createTransaction(establishmentId: string, input: CreateTransactionInput) {
  const [transaction] = await db
    .insert(transactions)
    .values({ ...input, establishmentId })
    .returning({
      id: transactions.id,
      description: transactions.description,
      amountCents: transactions.amountCents,
      type: transactions.type,
      date: transactions.date,
      appointmentId: transactions.appointmentId,
      createdAt: transactions.createdAt,
    })
  return transaction
}

export async function deleteTransaction(establishmentId: string, id: string) {
  const deleted = await db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.establishmentId, establishmentId)))
    .returning({ id: transactions.id })
  if (deleted.length === 0) throw new AppError('Lançamento não encontrado', 404)
}
