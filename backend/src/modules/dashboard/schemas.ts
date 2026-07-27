export interface DashboardMonthSummary {
  /**
   * null quando quem pediu não tem `finance.view`: o dashboard é a página
   * inicial de todo mundo, então em vez de barrar a tela inteira devolvemos
   * null nos números de dinheiro e a UI simplesmente não mostra o cartão.
   */
  revenueCents: number | null
  /** variação vs. mesmo período do mês anterior; null sem base de comparação */
  revenueChangePct: number | null
  /** atendimentos concluídos no período (denominador do ticket médio) */
  completedCount: number
  appointmentsCount: number
  appointmentsChangePct: number | null
  /** null sem `clients.view` (mesma lógica do faturamento) */
  newClients: number | null
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
