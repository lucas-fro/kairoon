import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../lib/format'

interface DialogProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  /** max-w tailwind class do painel (padrão max-w-lg) */
  maxWidth?: string
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  maxWidth = 'max-w-lg',
}: DialogProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={cn(
          'dialog-enter relative z-10 m-4 max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-surface p-6 shadow-floating',
          maxWidth,
        )}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-background hover:text-ink-secondary"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
        {title && (
          <h2 className="pr-8 font-display text-lg font-semibold text-ink">{title}</h2>
        )}
        {description && <p className="mt-1 text-sm text-ink-secondary">{description}</p>}
        <div className={cn(title && 'mt-5')}>{children}</div>
      </div>
    </div>,
    document.body,
  )
}
