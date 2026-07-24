import { useId, useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '../../lib/format'

interface HelpTooltipProps {
  /** Texto exibido no balão ao passar o mouse ou focar o ícone. */
  label: string
  /** Rótulo acessível do botão (padrão: "Ajuda"). */
  ariaLabel?: string
  className?: string
}

/**
 * Ícone de interrogação que revela uma explicação num balão ao passar o mouse
 * ou focar (teclado). Puramente CSS/estado local: ideal para textos curtos de
 * apoio ao lado de rótulos de campos.
 */
export function HelpTooltip({ label, ariaLabel = 'Ajuda', className }: HelpTooltipProps) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()

  return (
    <span className={cn('relative inline-flex', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-describedby={open ? tooltipId : undefined}
        className="inline-flex items-center justify-center rounded-full text-ink-tertiary transition-colors hover:text-ink-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-light"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault()
          setOpen((v) => !v)
        }}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-60 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-xs font-normal leading-relaxed text-surface shadow-lg"
        >
          {label}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </span>
      )}
    </span>
  )
}
