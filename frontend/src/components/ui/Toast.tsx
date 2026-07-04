import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../lib/format'

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

const kindStyles: Record<ToastKind, { icon: typeof CheckCircle2; chip: string }> = {
  success: { icon: CheckCircle2, chip: 'bg-success-light text-success-dark' },
  error: { icon: AlertCircle, chip: 'bg-error-light text-error-dark' },
  info: { icon: Info, chip: 'bg-secondary-light text-primary' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, kind, message }])
      setTimeout(() => remove(id), 4500)
    },
    [remove],
  )

  const value: ToastContextValue = {
    toast: {
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    },
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((item) => {
          const { icon: Icon, chip } = kindStyles[item.kind]
          return (
            <div
              key={item.id}
              className="dialog-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl bg-surface px-4 py-3 shadow-elevated"
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                  chip,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 pt-0.5 text-sm text-ink">{item.message}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="shrink-0 pt-0.5 text-ink-tertiary transition-colors hover:text-ink-secondary"
                aria-label="Fechar aviso"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return context.toast
}
