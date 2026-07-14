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

/** Passo 1: envia um código de redefinição para o e-mail da conta (resposta genérica). */
export function requestPasswordReset(email: string) {
  return api<{ ok: true }>('/auth/forgot-password/request', {
    method: 'POST',
    body: { email },
    auth: false,
  })
}

/** Passo 2: valida o código (sem consumir), antes de mostrar os campos de senha. */
export function verifyPasswordResetCode(email: string, code: string) {
  return api<{ valid: true }>('/auth/forgot-password/verify', {
    method: 'POST',
    body: { email, code },
    auth: false,
  })
}

/** Passo 3: confere o código e troca a senha. */
export function resetPassword(email: string, code: string, newPassword: string) {
  return api<{ ok: true }>('/auth/forgot-password/reset', {
    method: 'POST',
    body: { email, code, newPassword },
    auth: false,
  })
}
