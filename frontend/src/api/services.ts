import type { Service } from '../types/api'
import { api } from './client'

export interface ServicePayload {
  name: string
  durationMinutes?: number
  priceCents?: number
  active?: boolean
  isPackage?: boolean
  packageServiceIds?: string[]
  packageDiscountType?: 'percent' | 'fixed'
  packageDiscountValue?: number
}

export function listServices() {
  return api<Service[]>('/services')
}

export function createService(data: ServicePayload) {
  return api<Service>('/services', { method: 'POST', body: data })
}

export function updateService(id: string, data: Partial<ServicePayload>) {
  return api<Service>(`/services/${id}`, { method: 'PUT', body: data })
}

export function deleteService(id: string) {
  return api<void>(`/services/${id}`, { method: 'DELETE' })
}
