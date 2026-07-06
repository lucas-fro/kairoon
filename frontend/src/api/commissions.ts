import type { CommissionsReport } from '../types/api'
import { api } from './client'

export function getCommissionsReport(params: { from?: string; to?: string }) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const qs = query.toString()
  return api<CommissionsReport>(`/commissions${qs ? `?${qs}` : ''}`)
}
