import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../lib/format'

type ToastKind = 'success' | 'warning' | 'error' | 'info'

interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void
    warning: (message: string) => void
    error: (message: string) => void
    info: (message: string) => void
  }
}

const ToastContext = createContext<ToastContextValue | null>(null)

// Fundo -dark + texto branco em success/error/info (contraste ~5-6.5:1). O
// warning foge à regra: escurecer o âmbar o bastante pra ter contraste com
// texto branco o deixa marrom, não amarelo. Por isso usa o tom claro (a cor
// que de fato lê como "amarelo") com texto escuro, que passa de ~8:1.
const kindStyles: Record<ToastKind, { icon: typeof CheckCircle2; bg: string; fg: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-success-dark', fg: 'text-white' },
  warning: { icon: AlertTriangle, bg: 'bg-warning', fg: 'text-warning-dark' },
  error: { icon: AlertCircle, bg: 'bg-error-dark', fg: 'text-white' },
  info: { icon: Info, bg: 'bg-info-dark', fg: 'text-white' },
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
      warning: (message) => push('warning', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    },
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
        {toasts.map((item) => {
          const { icon: Icon, bg, fg } = kindStyles[item.kind]
          return (
            <div
              key={item.id}
              className={cn(
                'dialog-enter pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-elevated',
                bg,
                fg,
              )}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <span className="flex-1 pt-0.5 text-sm font-medium">{item.message}</span>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="shrink-0 pt-0.5 opacity-70 transition-opacity hover:opacity-100"
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
