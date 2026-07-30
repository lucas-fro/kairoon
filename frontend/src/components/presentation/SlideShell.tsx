import type { ReactNode } from 'react'
import { cn } from '../../lib/format'

interface SlideShellProps {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  /** Dica de interação, quando o slide tem algo para tocar. */
  hint?: ReactNode
  className?: string
}

/** Moldura comum dos slides: coluna centralizada, título e corpo livre. */
export function SlideShell({
  eyebrow,
  title,
  description,
  children,
  hint,
  className,
}: SlideShellProps) {
  return (
    <section
      className={cn(
        'mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-5 px-5 py-8 text-center sm:px-8',
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary">
            {eyebrow}
          </p>
        )}
        <h2 className="text-balance font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl lg:text-4xl">
          {title}
        </h2>
        {description && (
          <p className="max-w-xl text-balance text-sm text-ink-secondary sm:text-base">
            {description}
          </p>
        )}
      </div>

      {children}

      {hint && (
        <p className="text-xs font-medium text-ink-tertiary sm:text-[13px]">{hint}</p>
      )}
    </section>
  )
}
