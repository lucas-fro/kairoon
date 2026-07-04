import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface StepShellProps {
  title: string
  onBack?: () => void
  children: ReactNode
}

/** Moldura padrão de cada etapa do wizard: botão voltar + título consistente. */
export function StepShell({ title, onBack, children }: StepShellProps) {
  return (
    <div className="flex flex-1 flex-col pb-8 pt-4">
      <div className="mb-4 flex items-center gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Voltar"
            className="-ml-2 rounded-lg p-2 text-ink-tertiary transition-colors duration-150 hover:bg-surface hover:text-ink-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
