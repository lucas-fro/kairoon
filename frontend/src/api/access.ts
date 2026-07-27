import type { Establishment, User } from '../types/api'
import { api } from './client'

/** Convites e permissões da equipe. Tudo aqui é exclusivo do dono. */

export interface InviteInfo {
  name: string
  email: string
  establishmentName: string
  expiresAt: string
}

export interface AcceptInviteResponse {
  token: string
  user: User
  establishment: Establishment
}

export function sendInvite(employeeId: string) {
  return api<{ ok: true; expiresAt: string }>(`/access/employees/${employeeId}/invite`, {
    method: 'POST',
  })
}

export function revokeInvite(employeeId: string) {
  return api<{ ok: true }>(`/access/employees/${employeeId}/invite`, { method: 'DELETE' })
}

export function revokeAccess(employeeId: string) {
  return api<{ ok: true }>(`/access/employees/${employeeId}/access`, { method: 'DELETE' })
}

export function updatePermissions(employeeId: string, permissions: string[]) {
  return api<{ id: string; permissions: string[] }>(
    `/access/employees/${employeeId}/permissions`,
    { method: 'PUT', body: { permissions } },
  )
}

// --- Aceite do convite: chamado por quem ainda não tem conta ----------------

export function getInvite(token: string) {
  return api<InviteInfo>(`/access/invite/${encodeURIComponent(token)}`, { auth: false })
}

export function acceptInvite(token: string, password: string) {
  return api<AcceptInviteResponse>('/access/invite/accept', {
    method: 'POST',
    body: { token, password, acceptedLegal: true },
    auth: false,
  })
}
