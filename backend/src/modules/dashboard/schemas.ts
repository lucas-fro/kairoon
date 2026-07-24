export interface DashboardMonthSummary {
  revenueCents: number
  /** variação vs. mesmo período do mês anterior; null sem base de comparação */
  revenueChangePct: number | null
  /** atendimentos concluídos no período (denominador do ticket médio) */
  completedCount: number
  appointmentsCount: number
  appointmentsChangePct: number | null
  newClients: number
  newClientsChangePct: number | null
  /** 0–1, mês corrente */
  occupancyRate: number
  occupancyChangePct: number | null
  /** 0–1, apenas hoje */
  todayOccupancyRate: number
}

export interface DashboardTrendPoint {
  date: string
  appointmentsCount: number
  newClientsCount: number
}

export interface TodayAppointment {
  id: string
  startTime: string
  endTime: string
  status: string
  clientName: string
  serviceName: string
  employeeName: string
}

export interface DashboardSummary {
  month: DashboardMonthSummary
  /** série diária do mês (agendamentos e novos clientes) para o gráfico */
  trend: DashboardTrendPoint[]
  todayAppointments: TodayAppointment[]
}
