import type { AvailabilityResponse, BookingResult, PublicEstablishment } from '../types/api'
import { api } from './client'

export function getPublicEstablishment(slug: string) {
  return api<PublicEstablishment>(`/public/${slug}`, { auth: false })
}

export function getAvailability(
  slug: string,
  params: { serviceId: string; date: string; employeeId?: string },
) {
  const query = new URLSearchParams({ serviceId: params.serviceId, date: params.date })
  if (params.employeeId) query.set('employeeId', params.employeeId)
  return api<AvailabilityResponse>(`/public/${slug}/availability?${query.toString()}`, {
    auth: false,
  })
}

export function identifyClient(slug: string, phone: string) {
  return api<{ client: { name: string } | null }>(`/public/${slug}/identify`, {
    method: 'POST',
    body: { phone },
    auth: false,
  })
}

export interface CreateBookingPayload {
  serviceId: string
  employeeId?: string
  date: string
  startTime: string
  client: { name: string; phone: string; email?: string; birthDate?: string; gender?: string }
}

export function createBooking(slug: string, data: CreateBookingPayload) {
  return api<BookingResult>(`/public/${slug}/appointments`, {
    method: 'POST',
    body: data,
    auth: false,
  })
}
