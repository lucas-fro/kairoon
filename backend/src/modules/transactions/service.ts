import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { db } from '../../db'
import { transactions } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
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
      createdAt: true,
    },
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

  return {
    transactions: rows,
    summary: {
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
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
