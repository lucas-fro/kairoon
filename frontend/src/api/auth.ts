import type { AuthResponse, Establishment, User } from '../types/api'
import { api } from './client'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  cpf: string
  establishment: {
    name: string
    slug: string
    businessType: string
    phone?: string
    document: string
    address: string
    cep?: string
  }
  quiz?: Record<string, string>
}

export interface UpdateProfilePayload {
  name?: string
  email?: string
  phone?: string
  birthDate?: string
  cpf?: string
}

export function updateProfile(data: UpdateProfilePayload) {
  return api<User>('/auth/me', { method: 'PUT', body: data })
}

export function login(email: string, password: string) {
  return api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
}

export function register(payload: RegisterPayload) {
  return api<AuthResponse>('/auth/register', { method: 'POST', body: payload, auth: false })
}

export function getMe() {
  return api<{ user: User; establishment: Establishment }>('/auth/me')
}
