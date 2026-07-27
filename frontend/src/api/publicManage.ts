import type { AvailabilityResponse, ManagedAppointment } from '../types/api'
import { api } from './client'

/**
 * Área pública de gerenciamento do agendamento. Todas as chamadas são
 * `auth: false`: quem autoriza é o token do agendamento, não uma sessão.
 */

const base = (slug: string) => `/public/${encodeURIComponent(slug)}/manage`

export function getManagedAppointment(slug: string, token: string) {
  return api<{ appointment: ManagedAppointment }>(
    `${base(slug)}/appointment?t=${encodeURIComponent(token)}`,
    { auth: false },
  )
}

/** Resposta é sempre `{ sent: true }`, exista ou não o telefone na base. */
export function requestAccessCode(slug: string, phone: string) {
  return api<{ sent: true }>(`${base(slug)}/request-code`, {
    method: 'POST',
    body: { phone },
    auth: false,
  })
}

export function verifyAccessCode(slug: string, phone: string, code: string) {
  return api<{ appointments: ManagedAppointment[] }>(`${base(slug)}/verify`, {
    method: 'POST',
    body: { phone, code },
    auth: false,
  })
}

export function getRescheduleAvailability(slug: string, token: string, date: string) {
  const query = new URLSearchParams({ t: token, date })
  return api<AvailabilityResponse>(`${base(slug)}/availability?${query.toString()}`, {
    auth: false,
  })
}

export function cancelManagedAppointment(slug: string, token: string) {
  return api<{ appointment: ManagedAppointment }>(
    `${base(slug)}/cancel?t=${encodeURIComponent(token)}`,
    { method: 'POST', auth: false },
  )
}

export function rescheduleManagedAppointment(
  slug: string,
  token: string,
  data: { date: string; startTime: string },
) {
  return api<{ appointment: ManagedAppointment }>(
    `${base(slug)}/reschedule?t=${encodeURIComponent(token)}`,
    { method: 'POST', body: data, auth: false },
  )
}

export function optOutOfWhatsApp(slug: string, token: string) {
  return api<{ optedOut: true }>(`${base(slug)}/opt-out?t=${encodeURIComponent(token)}`, {
    method: 'POST',
    auth: false,
  })
}
