import { forwardRef, useId } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/format'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, className, id, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="mb-2 block text-[13px] font-medium text-ink-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-tertiary">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary',
            'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
            'disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled',
            leftIcon ? 'pl-10' : null,
            error
              ? 'border-error focus:border-error focus:ring-error-light'
              : 'border-line focus:border-secondary focus:ring-secondary-light',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-error-dark">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-ink-tertiary">{hint}</p>}
    </div>
  )
})
