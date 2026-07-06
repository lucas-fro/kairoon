export interface User {
  id: string
  name: string
  email: string
  phone: string | null
  birthDate: string | null
  cpf: string | null
}

export interface Socials {
  instagram?: string
  whatsapp?: string
}

export type PaymentMethod = 'cash' | 'pix' | 'debit' | 'credit'

export interface CreditBrand {
  name: string
  maxInstallments: number
}

export interface PaymentSettings {
  cash: boolean
  pix: boolean
  debit: boolean
  credit: { enabled: boolean; brands: CreditBrand[] }
}

export interface Payment {
  method: PaymentMethod
  brand: string | null
  installments: number | null
  amountCents: number
}

export type BusinessType = 'barbearia' | 'salao' | 'clinica' | 'outro'

export interface Establishment {
  id: string
  ownerId: string
  name: string
  slug: string
  logoUrl: string | null
  themeColor: string
  bannerImageUrl: string | null
  footerMessage: string | null
  welcomeMessage: string | null
  businessType: BusinessType | string
  phone: string | null
  document: string | null
  address: string | null
  cep: string | null
  socials: Socials | null
  autoConfirm: boolean
  paymentSettings: PaymentSettings
  quiz: Record<string, string> | null
  plan: string
  createdAt: string
}

export interface WorkingHour {
  id?: string
  dayOfWeek: number
  opensAt: string
  closesAt: string
  isClosed: boolean
}

export type PackageDiscountType = 'percent' | 'fixed'

export interface Service {
  id: string
  establishmentId: string
  name: string
  durationMinutes: number
  priceCents: number
  active: boolean
  isPackage: boolean
  packageServiceIds: string[] | null
  packageDiscountType: PackageDiscountType | null
  /** porcentagem (0–100) quando 'percent'; centavos de desconto quando 'fixed' */
  packageDiscountValue: number | null
  createdAt: string
}

export interface Product {
  id: string
  establishmentId: string
  name: string
  priceCents: number
  stockQuantity: number
  active: boolean
  brand: string | null
  supplier: string | null
  description: string | null
  sku: string | null
  barcode: string | null
  costCents: number | null
  createdAt: string
}

export interface SaleProduct {
  productId: string
  name: string
  quantity: number
  unitPriceCents: number
}

export type Gender = 'masculino' | 'feminino' | 'outro'

export type CommissionType = 'percent' | 'fixed'

export interface EmployeeCommission {
  serviceId: string
  /** porcentagem inteira (0–100) quando commissionType='percent'; centavos quando 'fixed' */
  value: number
}

export interface Employee {
  id: string
  establishmentId: string
  name: string
  photoUrl: string | null
  email: string | null
  phone: string | null
  birthDate: string | null
  gender: Gender | string | null
  workStart: string
  workEnd: string
  lunchStart: string | null
  lunchEnd: string | null
  workDays: number[]
  active: boolean
  commissionEnabled: boolean
  commissionType: CommissionType
  commissions: EmployeeCommission[]
  // Folha de pagamento (opcional)
  salaryCents: number | null
  bonuses: EmployeeBonus[]
  vrCents: number | null
  vtCents: number | null
  vaCents: number | null
  paymentDays: EmployeePaymentDay[]
  createdAt: string
}

export interface EmployeeBonus {
  label: string
  amountCents: number
}

export interface EmployeePaymentDay {
  /** dia do mês (1–31) */
  day: number
  /** valor pago neste dia (centavos) */
  amountCents: number
}

export interface TimeBlock {
  id: string
  date: string
  startTime: string | null
  endTime: string | null
  reason: string | null
  createdAt: string
}

export interface Client {
  id: string
  establishmentId: string
  name: string
  phone: string
  email: string | null
  birthDate: string | null
  gender: Gender | string | null
  createdAt: string
}

export interface ClientListItem {
  id: string
  name: string
  phone: string
  createdAt: string
  appointmentsCount: number
  lastVisit: string | null
  totalSpentCents: number
}

export interface ClientHistoryItem {
  id: string
  date: string
  startTime: string
  endTime: string
  status: AppointmentStatus
  createdVia: CreatedVia
  serviceName: string
  priceCents: number
  employeeName: string
}

export interface ClientDetail {
  client: Client
  stats: {
    appointmentsCount: number
    totalSpentCents: number
    lastVisit: string | null
  }
  history: ClientHistoryItem[]
}

export type AppointmentStatus = 'confirmed' | 'cancelled' | 'completed' | 'pending'
export type CreatedVia = 'panel' | 'public'

export interface Appointment {
  id: string
  date: string
  startTime: string
  endTime: string
  status: AppointmentStatus
  createdVia: CreatedVia
  notes: string | null
  discountCents: number
  payments: Payment[] | null
  saleProducts: SaleProduct[] | null
  client: { id: string; name: string; phone: string }
  service: { id: string; name: string; durationMinutes: number; priceCents: number }
  employee: { id: string; name: string }
}

export type WaitlistStatus = 'waiting' | 'scheduled'

export interface WaitlistEntry {
  id: string
  targetDate: string
  note: string | null
  status: WaitlistStatus
  createdAt: string
  client: { id: string; name: string; phone: string }
  service: { id: string; name: string; durationMinutes: number; priceCents: number }
  preferredEmployee: { id: string; name: string } | null
}

export type TransactionType = 'income' | 'expense'

export interface Transaction {
  id: string
  description: string
  amountCents: number
  type: TransactionType
  date: string
  appointmentId: string | null
  recurringExpenseId?: string | null
  createdAt: string
}

export interface RecurringExpense {
  id: string
  description: string
  amountCents: number
  /** dia do vencimento (1–31) */
  dayOfMonth: number
  active: boolean
  createdAt: string
}

export interface RecurringExpenseForecastItem {
  /** 'expense' = custo fixo manual; 'payroll' = pagamento (folha) de um profissional */
  kind: 'expense' | 'payroll'
  /** id do custo fixo ('expense') ou sintético 'employeeId:day' ('payroll') */
  id: string
  employeeId: string | null
  description: string
  amountCents: number
  dayOfMonth: number
  /** vencimento no mês consultado ('YYYY-MM-DD') */
  dueDate: string
  /** true quando já foi baixado (lançado no caixa) no mês */
  posted: boolean
  transactionId: string | null
  paidDate: string | null
  /** só em payroll: comissão do profissional no mês (informativo) */
  commissionCents: number | null
}

export interface RecurringExpenseForecast {
  month: string
  items: RecurringExpenseForecastItem[]
  summary: {
    totalCents: number
    postedCents: number
    pendingCents: number
    count: number
    pendingCount: number
  }
}

export interface TransactionsResponse {
  transactions: Transaction[]
  summary: {
    incomeCents: number
    expenseCents: number
    balanceCents: number
  }
}

export interface CommissionByEmployee {
  employeeId: string
  employeeName: string
  /** quantidade de atendimentos concluídos que geraram comissão */
  count: number
  /** soma da base de cálculo (preço dos serviços) em centavos */
  baseCents: number
  /** total de comissão apurada em centavos */
  commissionCents: number
}

export interface CommissionsReport {
  summary: { totalCents: number; count: number }
  byEmployee: CommissionByEmployee[]
}

export interface DashboardSummary {
  todayAppointments: number
  todayRevenueCents: number
  monthRevenueCents: number
  newClientsThisMonth: number
  occupancyRate: number
  nextAppointments: {
    id: string
    startTime: string
    endTime: string
    status: AppointmentStatus
    clientName: string
    serviceName: string
    employeeName: string
  }[]
}

export interface RevenuePoint {
  period: string
  incomeCents: number
  expenseCents: number
}

export interface TopService {
  serviceId: string
  name: string
  count: number
  revenueCents: number
}

export interface OccupancyItem {
  dayOfWeek: number
  bookedMinutes: number
  availableMinutes: number
  rate: number
}

export interface PlanInfo {
  plan: string
  limits: { employees: number; establishments: number }
  usage: { employees: number }
}

export interface AuthResponse {
  token: string
  user: User
  establishment: Establishment
}

export interface PublicBranding {
  /** Cor de marca efetiva (sistema no grátis, personalizada no pago) */
  brandColor: string
  bannerImageUrl: string | null
  /** true no plano grátis: mostra "Agendamento feito pela Kairoon" */
  showKairoonWatermark: boolean
  /** mensagem de rodapé personalizada (plano pago) */
  footerMessage: string | null
}

export interface PublicEstablishment {
  establishment: {
    id: string
    name: string
    slug: string
    logoUrl: string | null
    themeColor: string
    welcomeMessage: string | null
    phone: string | null
    businessType: string
    socials: Socials | null
  }
  branding: PublicBranding
  services: {
    id: string
    name: string
    durationMinutes: number
    priceCents: number
    isPackage: boolean
    originalPriceCents: number | null
  }[]
  employees: { id: string; name: string; photoUrl: string | null }[]
  workingHours: WorkingHour[]
}

export interface AvailabilityResponse {
  employeeId: string
  slots: string[]
}

export interface BookingResult {
  appointment: {
    id: string
    date: string
    startTime: string
    endTime: string
    status: AppointmentStatus
  }
  client: { id: string; name: string; phone: string }
  service: { id: string; name: string; durationMinutes: number; priceCents: number }
  employee: { id: string; name: string }
  establishment: { name: string; slug: string; phone: string | null }
}
