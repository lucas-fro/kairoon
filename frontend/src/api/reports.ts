import type {
  AppointmentsByStatusPoint,
  BusyHourCell,
  EmployeeRevenue,
  NewClientsPoint,
  OccupancyItem,
  PaymentMethodItem,
  RevenuePoint,
  TopClient,
  TopService,
} from '../types/api'
import { api } from './client'

type GroupBy = 'day' | 'month'

function rangeQuery(params: { from?: string; to?: string }) {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  return query
}

function withQuery(path: string, query: URLSearchParams) {
  const qs = query.toString()
  return `${path}${qs ? `?${qs}` : ''}`
}

export function getRevenueReport(params: { from?: string; to?: string; groupBy?: GroupBy }) {
  const query = rangeQuery(params)
  if (params.groupBy) query.set('groupBy', params.groupBy)
  return api<RevenuePoint[]>(withQuery('/reports/revenue', query))
}

export function getTopServices(params: { from?: string; to?: string; sort?: 'count' | 'revenue' }) {
  const query = rangeQuery(params)
  if (params.sort) query.set('sort', params.sort)
  return api<TopService[]>(withQuery('/reports/top-services', query))
}

export function getOccupancyReport(params: { from?: string; to?: string }) {
  return api<OccupancyItem[]>(withQuery('/reports/occupancy', rangeQuery(params)))
}

export function getPaymentMethodsReport(params: { from?: string; to?: string }) {
  return api<PaymentMethodItem[]>(withQuery('/reports/payment-methods', rangeQuery(params)))
}

export function getTopClientsReport(params: { from?: string; to?: string }) {
  return api<TopClient[]>(withQuery('/reports/top-clients', rangeQuery(params)))
}

export function getRevenueByEmployeeReport(params: { from?: string; to?: string }) {
  return api<EmployeeRevenue[]>(withQuery('/reports/revenue-by-employee', rangeQuery(params)))
}

export function getNewClientsReport(params: { from?: string; to?: string; groupBy?: GroupBy }) {
  const query = rangeQuery(params)
  if (params.groupBy) query.set('groupBy', params.groupBy)
  return api<NewClientsPoint[]>(withQuery('/reports/new-clients', query))
}

export function getAppointmentsByStatusReport(params: {
  from?: string
  to?: string
  groupBy?: GroupBy
}) {
  const query = rangeQuery(params)
  if (params.groupBy) query.set('groupBy', params.groupBy)
  return api<AppointmentsByStatusPoint[]>(withQuery('/reports/appointments-by-status', query))
}

export function getBusyHoursReport(params: { from?: string; to?: string }) {
  return api<BusyHourCell[]>(withQuery('/reports/busy-hours', rangeQuery(params)))
}
