import type { ReactNode } from 'react'
import { Check, ChevronDown, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/format'

export type CheckoutSectionStatus = 'locked' | 'active' | 'done'

interface CheckoutSectionProps {
  step: number
  title: string
  icon: LucideIcon
  status: CheckoutSectionStatus
  /** Prévia curta exibida ao lado do título quando a seção está fechada e completa. */
  summary?: string
  onOpen: () => void
  children: ReactNode
}

/**
 * Seção de formulário em "acordeão numerado": abre uma de cada vez, só pode
 * ser reaberta depois de desbloqueada (nunca trava de volta), e mostra um
 * resumo do que já foi preenchido quando fechada.
 */
export function CheckoutSection({ step, title, icon: Icon, status, summary, onOpen, children }: CheckoutSectionProps) {
  const isOpen = status === 'active'
  const isLocked = status === 'locked'
  const isDone = status === 'done'

  return (
    <div className={cn('overflow-hidden rounded-xl border', isOpen ? 'border-secondary' : 'border-line')}>
      <button
        type="button"
        onClick={onOpen}
        disabled={isLocked}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150',
          isLocked ? 'cursor-not-allowed bg-background' : 'bg-surface hover:bg-surface-hover',
        )}
      >
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-150',
            isDone
              ? 'bg-success-light text-success-dark'
              : isOpen
                ? 'bg-primary text-white'
                : 'bg-background text-ink-disabled',
          )}
        >
          {isDone ? <Check className="h-4 w-4" /> : step}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn('flex items-center gap-2 text-sm font-semibold', isLocked ? 'text-ink-disabled' : 'text-ink')}>
            <Icon className="h-4 w-4 shrink-0" />
            {title}
          </span>
          {isDone && summary && <span className="mt-0.5 truncate text-xs text-ink-tertiary">{summary}</span>}
        </span>
        {isLocked ? (
          <Lock className="h-4 w-4 shrink-0 text-ink-disabled" />
        ) : (
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-ink-tertiary transition-transform duration-200', isOpen && 'rotate-180')}
          />
        )}
      </button>
      <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-line-divider px-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
