import type { Appointment, WaitlistEntry, WaitlistStatus } from '../types/api'
import { api } from './client'

export function listWaitlist(params?: { status?: WaitlistStatus; date?: string }) {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.date) query.set('date', params.date)
  const qs = query.toString()
  return api<WaitlistEntry[]>(`/waitlist${qs ? `?${qs}` : ''}`)
}

export interface CreateWaitlistPayload {
  clientId: string
  serviceId: string
  preferredEmployeeId?: string
  targetDate?: string
  note?: string
}

export function createWaitlistEntry(data: CreateWaitlistPayload) {
  return api<WaitlistEntry>('/waitlist', { method: 'POST', body: data })
}

export function promoteWaitlistEntry(
  id: string,
  data: { startTime: string; employeeId?: string },
) {
  return api<Appointment>(`/waitlist/${id}/promote`, { method: 'POST', body: data })
}

export function deleteWaitlistEntry(id: string) {
  return api<void>(`/waitlist/${id}`, { method: 'DELETE' })
}
