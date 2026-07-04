import { forwardRef, useId } from 'react'
import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/format'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, ...props },
  ref,
) {
  const generatedId = useId()
  const textareaId = id ?? generatedId

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={textareaId}
          className="mb-2 block text-[13px] font-medium text-ink-secondary"
        >
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={textareaId}
        className={cn(
          'min-h-[88px] w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-tertiary',
          'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
          error
            ? 'border-error focus:border-error focus:ring-error-light'
            : 'border-line focus:border-secondary focus:ring-secondary-light',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-error-dark">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-ink-tertiary">{hint}</p>}
    </div>
  )
})
