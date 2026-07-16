import { cn } from '../../lib/format'
import type { BillingCycle } from '../../types/api'

interface BillingCycleToggleProps {
  value: BillingCycle
  onChange: (cycle: BillingCycle) => void
  /** Desconto do anual sobre 12x o mensal, em % inteiro (ex.: 20) */
  discountPercent?: number
}

export function BillingCycleToggle({ value, onChange, discountPercent }: BillingCycleToggleProps) {
  return (
    <div
      className="inline-flex items-center rounded-lg bg-background p-1"
      role="tablist"
      aria-label="Ciclo de cobrança"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === 'monthly'}
        onClick={() => onChange('monthly')}
        className={cn(
          'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
          value === 'monthly' ? 'bg-surface text-ink shadow-card' : 'text-ink-secondary hover:text-ink',
        )}
      >
        Mensal
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === 'yearly'}
        onClick={() => onChange('yearly')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
          value === 'yearly' ? 'bg-surface text-ink shadow-card' : 'text-ink-secondary hover:text-ink',
        )}
      >
        Anual
        {typeof discountPercent === 'number' && discountPercent > 0 && (
          <span className="rounded-full bg-success-light px-1.5 py-0.5 text-[11px] font-semibold text-success-dark">
            -{discountPercent}%
          </span>
        )}
      </button>
    </div>
  )
}

/** Desconto do anual sobre 12x o valor mensal, arredondado (ex.: 20) */
export function getAnnualDiscountPercent(monthlyCents: number, yearlyCents: number): number {
  if (monthlyCents <= 0) return 0
  return Math.round((1 - yearlyCents / (monthlyCents * 12)) * 100)
}
