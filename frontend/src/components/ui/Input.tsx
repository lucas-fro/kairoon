import { forwardRef, useId, useRef } from 'react'
import type { InputHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { cn } from '../../lib/format'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  leftIcon?: ReactNode
  /** Ícone/ação à direita (interativo, ex.: botão de mostrar/ocultar senha). */
  rightIcon?: ReactNode
}

// Tipos nativos cujo seletor (calendário/relógio) só abre ao clicar no ícone;
// aqui abrimos ao clicar em qualquer parte do campo.
const PICKER_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week'])

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightIcon, className, id, type, onClick, ...props },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const localRef = useRef<HTMLInputElement | null>(null)

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    onClick?.(event)
    if (type && PICKER_TYPES.has(type)) {
      const el = localRef.current
      if (el && typeof el.showPicker === 'function') {
        try {
          el.showPicker()
        } catch {
          // Ignora: alguns navegadores exigem foco prévio ou não suportam showPicker.
        }
      }
    }
  }

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
          ref={(el) => {
            localRef.current = el
            if (typeof ref === 'function') ref(el)
            else if (ref) ref.current = el
          }}
          id={inputId}
          type={type}
          onClick={handleClick}
          className={cn(
            'h-10 w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary',
            'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
            'disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled',
            leftIcon ? 'pl-10' : null,
            rightIcon ? 'pr-10' : null,
            error
              ? 'border-error focus:border-error focus:ring-error-light'
              : 'border-line focus:border-secondary focus:ring-secondary-light',
            className,
          )}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
            {rightIcon}
          </span>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-error-dark">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-ink-tertiary">{hint}</p>}
    </div>
  )
})
