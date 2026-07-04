import type { DashboardSummary } from '../types/api'
import { api } from './client'

export function getDashboardSummary() {
  return api<DashboardSummary>('/dashboard/summary')
}
