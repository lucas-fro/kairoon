import type { AuthResponse, Establishment, User } from '../types/api'
import { api } from './client'

export interface RegisterPayload {
  name: string
  email: string
  password: string
  cpf?: string
  phone?: string
  establishment: {
    name: string
    slug: string
    businessType: string
    phone?: string
    email?: string
    socials?: { instagram?: string; whatsapp?: string }
    document?: string
    address?: string
    addressNumber?: string
    neighborhood?: string
    city?: string
    state?: string
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

export function checkSlugAvailability(slug: string) {
  return api<{ available: boolean }>(`/auth/slug-available?slug=${encodeURIComponent(slug)}`, {
    auth: false,
  })
}

export function getMe() {
  return api<{ user: User; establishment: Establishment }>('/auth/me')
}

/** Envia um código de redefinição de senha para o e-mail do usuário logado. */
export function requestPasswordReset() {
  return api<{ email: string }>('/auth/password-reset/request', { method: 'POST' })
}

/** Confere o código e troca a senha. */
export function confirmPasswordReset(data: { code: string; newPassword: string }) {
  return api<{ ok: true }>('/auth/password-reset/confirm', { method: 'POST', body: data })
}
