export interface NextAppointment {
  id: string
  startTime: string
  endTime: string
  status: string
  clientName: string
  serviceName: string
  employeeName: string
}

export interface DashboardSummary {
  todayAppointments: number
  todayRevenueCents: number
  monthRevenueCents: number
  newClientsThisMonth: number
  occupancyRate: number
  nextAppointments: NextAppointment[]
}
