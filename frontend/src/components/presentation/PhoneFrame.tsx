import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { cn } from '../../lib/format'

interface PhoneFrameProps {
  children: ReactNode
  /** Endereço mostrado na barra do navegador dentro do aparelho. */
  url?: string
  className?: string
}

/**
 * Moldura de celular usada na apresentação para emoldurar o link público real.
 * Os raios são valores arbitrários (a escala do design system é sóbria de
 * propósito) porque aqui o objetivo é parecer um aparelho de verdade.
 */
export function PhoneFrame({ children, url, className }: PhoneFrameProps) {
  return (
    <div
      className={cn(
        'flex w-full max-w-[19rem] flex-col overflow-hidden rounded-[2rem] border-[6px] border-ink bg-ink shadow-floating',
        className,
      )}
    >
      {url && (
        <div className="flex shrink-0 items-center justify-center px-3 pb-2 pt-2.5">
          <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1">
            <Lock className="h-3 w-3 shrink-0 text-white/50" />
            <span className="truncate text-[11px] text-white/70">{url}</span>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-surface">{children}</div>
    </div>
  )
}
