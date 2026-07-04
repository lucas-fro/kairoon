import type { OccupancyItem, RevenuePoint, TopService } from '../types/api'
import { api } from './client'

function rangeQuery(params: { from?: string; to?: string }) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  return query
}

export function getRevenueReport(params: { from?: string; to?: string; groupBy?: 'day' | 'month' }) {
  const query = rangeQuery(params)
  if (params.groupBy) query.set('groupBy', params.groupBy)
  const qs = query.toString()
  return api<RevenuePoint[]>(`/reports/revenue${qs ? `?${qs}` : ''}`)
}

export function getTopServices(params: { from?: string; to?: string }) {
  const qs = rangeQuery(params).toString()
  return api<TopService[]>(`/reports/top-services${qs ? `?${qs}` : ''}`)
}

export function getOccupancyReport(params: { from?: string; to?: string }) {
  const qs = rangeQuery(params).toString()
  return api<OccupancyItem[]>(`/reports/occupancy${qs ? `?${qs}` : ''}`)
}
