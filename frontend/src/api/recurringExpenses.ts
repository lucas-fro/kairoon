import type { RecurringExpense, RecurringExpenseForecast, Transaction } from '../types/api'
import { api } from './client'

export interface RecurringExpensePayload {
  description: string
  amountCents: number
  dayOfMonth: number
  active?: boolean
}

export function listRecurringExpenses() {
  return api<RecurringExpense[]>('/recurring-expenses')
}

export function createRecurringExpense(data: RecurringExpensePayload) {
  return api<RecurringExpense>('/recurring-expenses', { method: 'POST', body: data })
}

export function updateRecurringExpense(id: string, data: Partial<RecurringExpensePayload>) {
  return api<RecurringExpense>(`/recurring-expenses/${id}`, { method: 'PUT', body: data })
}

export function deleteRecurringExpense(id: string) {
  return api<void>(`/recurring-expenses/${id}`, { method: 'DELETE' })
}

export function getRecurringExpensesForecast(month?: string) {
  const qs = month ? `?month=${month}` : ''
  return api<RecurringExpenseForecast>(`/recurring-expenses/forecast${qs}`)
}

export function settleRecurringExpense(id: string, month: string) {
  return api<Transaction>(`/recurring-expenses/${id}/settle`, {
    method: 'POST',
    body: { month },
  })
}

export function settlePayroll(employeeId: string, month: string, day: number) {
  return api<Transaction>('/recurring-expenses/payroll/settle', {
    method: 'POST',
    body: { employeeId, month, day },
  })
}
