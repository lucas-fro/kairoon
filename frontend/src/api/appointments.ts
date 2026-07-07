import type { Appointment, AppointmentStatus, PaymentMethod } from '../types/api'
import { api } from './client'

export interface CreateAppointmentPayload {
  serviceId: string
  employeeId: string
  date: string
  startTime: string
  notes?: string
  clientId?: string
  clientName?: string
  clientPhone?: string
}

export interface UpdateAppointmentPayload {
  status?: AppointmentStatus
  date?: string
  startTime?: string
  employeeId?: string
  discountCents?: number
  /** cupom aplicado no fechamento (o servidor revalida e recalcula) */
  couponCode?: string
  /** soma a dívida anterior do cliente ao valor devido e a abate no pagamento */
  settlePreviousDebt?: boolean
  payments?: {
    method: PaymentMethod
    installments?: number | null
    amountCents: number
  }[]
  saleProducts?: { productId: string; quantity: number }[]
  saleServices?: { serviceId: string; quantity: number }[]
}

export function listAppointments(params: {
  start: string
  end: string
  employeeId?: string
  status?: AppointmentStatus
}) {
  const query = new URLSearchParams({ start: params.start, end: params.end })
  if (params.employeeId) query.set('employeeId', params.employeeId)
  if (params.status) query.set('status', params.status)
  return api<Appointment[]>(`/appointments?${query.toString()}`)
}

export function getAppointment(id: string) {
  return api<Appointment>(`/appointments/${id}`)
}

/** Agendamentos criados nas últimas `sinceHours` horas (por data de criação). */
export function listRecentAppointments(sinceHours = 24) {
  return api<Appointment[]>(`/appointments/recent?sinceHours=${sinceHours}`)
}

export function searchAppointments(q: string) {
  return api<Appointment[]>(`/appointments/search?q=${encodeURIComponent(q)}`)
}

export function createAppointment(data: CreateAppointmentPayload) {
  return api<Appointment>('/appointments', { method: 'POST', body: data })
}

export function updateAppointment(id: string, data: UpdateAppointmentPayload) {
  return api<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: data })
}
