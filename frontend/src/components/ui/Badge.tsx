import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/format'

type Tone =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral'
  | 'brand'
  // aliases legados
  | 'danger'
  | 'primary'
  | 'secondary'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const toneClasses: Record<Tone, string> = {
  success: 'bg-success-light text-success-dark',
  warning: 'bg-warning-light text-warning-dark',
  error: 'bg-error-light text-error-dark',
  info: 'bg-info-light text-info-dark',
  neutral: 'bg-line-divider text-ink-secondary',
  brand: 'bg-primary/10 text-primary',
  danger: 'bg-error-light text-error-dark',
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-info-light text-info-dark',
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-md px-2.5 text-xs font-medium',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  )
}
