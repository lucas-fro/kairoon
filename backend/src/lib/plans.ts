// Catálogo dos planos pagos assináveis via checkout. Preços espelham os
// publicados na LP (LP/index.html#planos): valor mensal e valor anual total
// (12x o mensal com desconto), sempre em centavos.
export const PLANS = {
  basico: { name: 'Básico', monthlyCents: 9_900, yearlyCents: 94_800 },
  essencial: { name: 'Essencial', monthlyCents: 24_900, yearlyCents: 238_800 },
} as const

export type PlanSlug = keyof typeof PLANS
export type BillingCycle = 'monthly' | 'yearly'

// ---------------------------------------------------------------------------
// Matriz de planos: fonte ÚNICA da verdade de o que cada plano libera e limita.
// Para mover um recurso de plano, mexa só aqui (o backend aplica e o getPlan
// devolve isto pro frontend gatear a UI). 'free' também entra na matriz.
// ---------------------------------------------------------------------------

/** Recursos gateáveis por plano. */
export const PLAN_FEATURES = [
  'personalizacao', // página de agendamento personalizada (cor, banner, sem marca Kairoon)
  'estoque', // controle de estoque de produtos
  'fidelidade', // cartão de fidelidade e programa de pontos
  'financeiro', // controle financeiro (fluxo de caixa, despesas)
  'relatorios', // relatórios essenciais (faturamento, clientes, serviços, status)
  'relatorios_avancados', // relatórios avançados (métodos, ranking de clientes/equipe, ocupação, pico)
  'cupons', // cupons e campanhas de marketing
  'clientes_crm', // insights de clientes: aniversariantes e clientes sumidos (reativação)
] as const

export type PlanFeature = (typeof PLAN_FEATURES)[number]

/** Sentinela de "ilimitado" para limites numéricos (JSON não serializa Infinity). */
export const UNLIMITED = 999

interface PlanTier {
  rank: number
  /** Máximo de profissionais cadastráveis (UNLIMITED = ilimitado). */
  employees: number
  features: PlanFeature[]
}

const ALL_FEATURES: PlanFeature[] = [
  'personalizacao',
  'estoque',
  'fidelidade',
  'financeiro',
  'relatorios',
  'relatorios_avancados',
  'cupons',
  'clientes_crm',
]

export const PLAN_TIERS: Record<'free' | PlanSlug | 'profissional', PlanTier> = {
  free: { rank: 0, employees: 1, features: [] },
  basico: {
    rank: 1,
    employees: 5,
    features: ['personalizacao', 'estoque', 'fidelidade', 'financeiro', 'relatorios'],
  },
  essencial: {
    rank: 2,
    employees: 10,
    features: ALL_FEATURES,
  },
  // Plano sob consulta (contratado via vendas e definido manualmente no banco,
  // não passa pelo checkout): tudo do Essencial + profissionais ilimitados.
  profissional: {
    rank: 3,
    employees: UNLIMITED,
    features: ALL_FEATURES,
  },
}

export function planTier(plan: string): PlanTier {
  return PLAN_TIERS[plan as keyof typeof PLAN_TIERS] ?? PLAN_TIERS.free
}

export function planHasFeature(plan: string, feature: PlanFeature): boolean {
  return planTier(plan).features.includes(feature)
}

export function planEmployeeLimit(plan: string): number {
  return planTier(plan).employees
}

/** Nome do plano mais barato que inclui o recurso (para mensagens de upgrade). */
export function minPlanNameForFeature(feature: PlanFeature): string {
  if (PLAN_TIERS.basico.features.includes(feature)) return PLANS.basico.name
  if (PLAN_TIERS.essencial.features.includes(feature)) return PLANS.essencial.name
  return 'pago'
}

/** Mapa { feature: boolean } do que o plano libera (consumido pelo frontend). */
export function planFeatureMap(plan: string): Record<PlanFeature, boolean> {
  const tier = planTier(plan)
  return PLAN_FEATURES.reduce(
    (acc, feature) => {
      acc[feature] = tier.features.includes(feature)
      return acc
    },
    {} as Record<PlanFeature, boolean>,
  )
}

export function isPlanSlug(value: string): value is PlanSlug {
  return value in PLANS
}

/** Valor da cobrança do ciclo, em centavos. */
export function getPlanCycleCents(planSlug: PlanSlug, billingCycle: BillingCycle): number {
  const plan = PLANS[planSlug]
  return billingCycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents
}

/** A API do Asaas espera o valor em reais (decimal), não em centavos. */
export function centsToReais(cents: number): number {
  return Math.round(cents) / 100
}

/** Soma um ciclo de cobrança a uma data (usado pra estimar currentPeriodEnd). */
export function addBillingCycle(date: Date, billingCycle: BillingCycle): Date {
  const next = new Date(date)
  if (billingCycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1)
  } else {
    next.setMonth(next.getMonth() + 1)
  }
  return next
}
