import type { Transaction, TransactionsResponse, TransactionType } from '../types/api'
import { api } from './client'

export function listTransactions(params: { from?: string; to?: string; type?: TransactionType }) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  if (params.type) query.set('type', params.type)
  const qs = query.toString()
  return api<TransactionsResponse>(`/transactions${qs ? `?${qs}` : ''}`)
}

export function createTransaction(data: {
  description: string
  amountCents: number
  type: TransactionType
  date: string
}) {
  return api<Transaction>('/transactions', { method: 'POST', body: data })
}

export function deleteTransaction(id: string) {
  return api<void>(`/transactions/${id}`, { method: 'DELETE' })
}
