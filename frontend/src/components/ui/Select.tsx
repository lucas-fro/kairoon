import { forwardRef, useId } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/format'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, className, id, children, ...props },
  ref,
) {
  const generatedId = useId()
  const selectId = id ?? generatedId

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-2 block text-[13px] font-medium text-ink-secondary">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={cn(
          'h-10 w-full cursor-pointer rounded-lg border bg-surface px-3 text-sm text-ink',
          'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
          'disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled',
          error
            ? 'border-error focus:border-error focus:ring-error-light'
            : 'border-line focus:border-secondary focus:ring-secondary-light',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1.5 text-xs text-error-dark">{error}</p>}
    </div>
  )
})
