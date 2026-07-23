import type {
  BirthdayClient,
  Client,
  ClientDetail,
  ClientListItem,
  LapsedClient,
} from '../types/api'
import { api } from './client'

export function listClients(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : ''
  return api<ClientListItem[]>(`/clients${query}`)
}

export function listBirthdays() {
  return api<BirthdayClient[]>('/clients/birthdays')
}

export function listLapsed(minDays?: number) {
  const query = minDays !== undefined ? `?minDays=${minDays}` : ''
  return api<LapsedClient[]>(`/clients/lapsed${query}`)
}

export function getClient(id: string) {
  return api<ClientDetail>(`/clients/${id}`)
}

export interface ClientPayload {
  name?: string
  phone?: string
  email?: string
  birthDate?: string
  gender?: string
}

export function createClient(data: ClientPayload & { name: string; phone: string }) {
  return api<Client>('/clients', { method: 'POST', body: data })
}

export function updateClient(id: string, data: ClientPayload) {
  return api<Client>(`/clients/${id}`, { method: 'PUT', body: data })
}
