import type { Establishment, PlanInfo, TimeBlock, WorkingHour } from '../types/api'
import { api } from './client'

export function getEstablishment() {
  return api<Establishment>('/establishment')
}

export function updateEstablishment(data: {
  name?: string
  phone?: string
  email?: string
  document?: string
  address?: string
  addressNumber?: string
  neighborhood?: string
  city?: string
  state?: string
  cep?: string
  socials?: import('../types/api').Socials
  showInstagram?: boolean
  showWhatsapp?: boolean
  autoConfirm?: boolean
  paymentSettings?: import('../types/api').PaymentSettings
  welcomeMessage?: string
  themeColor?: string
  palette?: string
  logoUrl?: string
  bannerImageUrl?: string
  footerMessage?: string
  businessType?: string
  quiz?: Record<string, string>
}) {
  return api<Establishment>('/establishment', { method: 'PUT', body: data })
}

export function updateSlug(slug: string) {
  return api<Establishment>('/establishment/slug', { method: 'PUT', body: { slug } })
}

export function checkSlugAvailability(slug: string) {
  return api<{ available: boolean }>(
    `/establishment/slug-availability?slug=${encodeURIComponent(slug)}`,
  )
}

export function getWorkingHours() {
  return api<WorkingHour[]>('/establishment/working-hours')
}

export function updateWorkingHours(workingHours: WorkingHour[]) {
  return api<WorkingHour[]>('/establishment/working-hours', {
    method: 'PUT',
    body: { workingHours },
  })
}

export function getPlan() {
  return api<PlanInfo>('/establishment/plan')
}

export function listTimeBlocks() {
  return api<TimeBlock[]>('/establishment/time-blocks')
}

export function createTimeBlock(data: {
  date: string
  startTime?: string
  endTime?: string
  reason?: string
}) {
  return api<TimeBlock>('/establishment/time-blocks', { method: 'POST', body: data })
}

export function deleteTimeBlock(id: string) {
  return api<void>(`/establishment/time-blocks/${id}`, { method: 'DELETE' })
}

export function deleteAccount() {
  return api<void>('/establishment', { method: 'DELETE' })
}
