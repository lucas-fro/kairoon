// Catálogo dos planos pagos assináveis via checkout. Preços espelham os
// publicados na LP (LP/index.html#planos): valor mensal e valor anual total
// (12x o mensal com desconto), sempre em centavos.
export const PLANS = {
  basico: { name: 'Básico', monthlyCents: 9_900, yearlyCents: 94_800 },
  essencial: { name: 'Essencial', monthlyCents: 24_900, yearlyCents: 238_800 },
} as const

export type PlanSlug = keyof typeof PLANS
export type BillingCycle = 'monthly' | 'yearly'

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
