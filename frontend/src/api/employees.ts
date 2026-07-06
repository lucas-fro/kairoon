import type { Employee } from '../types/api'
import { api } from './client'

export interface EmployeePayload {
  name: string
  photoUrl?: string
  email?: string
  phone?: string
  birthDate?: string
  gender?: string
  workStart?: string
  workEnd?: string
  lunchStart?: string
  lunchEnd?: string
  workDays?: number[]
  applyScheduleToAll?: boolean
  active?: boolean
  commissionEnabled?: boolean
  commissionType?: 'percent' | 'fixed'
  commissions?: { serviceId: string; value: number }[]
  applyCommissionToAll?: boolean
  // Folha de pagamento (opcional)
  salaryCents?: number | null
  bonuses?: { label: string; amountCents: number }[]
  vrCents?: number | null
  vtCents?: number | null
  vaCents?: number | null
  paymentDays?: { day: number; amountCents: number }[]
}

export function listEmployees() {
  return api<Employee[]>('/employees')
}

export function createEmployee(data: EmployeePayload) {
  return api<Employee>('/employees', { method: 'POST', body: data })
}

export function updateEmployee(id: string, data: Partial<EmployeePayload>) {
  return api<Employee>(`/employees/${id}`, { method: 'PUT', body: data })
}

export function deleteEmployee(id: string) {
  return api<void>(`/employees/${id}`, { method: 'DELETE' })
}
