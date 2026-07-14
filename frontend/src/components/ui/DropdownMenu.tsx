import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { MoreVertical } from 'lucide-react'
import { cn } from '../../lib/format'

interface DropdownMenuProps {
  /** Itens do menu — use <DropdownItem>. */
  children: ReactNode
  /** Conteúdo do gatilho padrão (ícone de reticências se omitido). */
  trigger?: ReactNode
  /**
   * Gatilho totalmente customizado (ex.: split button). Recebe o estado e um
   * `toggle` para abrir/fechar. Quando presente, ignora `trigger`.
   */
  renderTrigger?: (opts: { open: boolean; toggle: () => void }) => ReactNode
  ariaLabel?: string
  /** Alinhamento do painel em relação ao gatilho. */
  align?: 'start' | 'end'
  /** Classe do wrapper (útil para esconder/mostrar por breakpoint). */
  className?: string
  /**
   * Fecha o painel ao clicar em qualquer item (padrão). Desative para painéis
   * com controles interativos (selects, toggles) que devem permanecer abertos.
   */
  closeOnItemClick?: boolean
  /** Sobrescreve as classes do painel (largura/padding). */
  panelClassName?: string
}

/**
 * Menu de ações ancorado ao gatilho. Fecha ao clicar fora, apertar Esc ou
 * selecionar um item. Posicionamento absoluto (use em áreas fora de scroll/modal).
 */
export function DropdownMenu({
  children,
  trigger,
  renderTrigger,
  ariaLabel = 'Mais ações',
  align = 'end',
  className,
  closeOnItemClick = true,
  panelClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative', className)}>
      {renderTrigger ? (
        renderTrigger({ open, toggle: () => setOpen((v) => !v) })
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-surface text-ink-secondary transition-colors',
            'hover:bg-surface-hover focus:outline-none focus:ring-[3px] focus:ring-secondary-light',
            open ? 'border-secondary' : 'border-line',
          )}
        >
          {trigger ?? <MoreVertical className="h-4 w-4" />}
        </button>
      )}

      {open && (
        <div
          role="menu"
          onClick={closeOnItemClick ? () => setOpen(false) : undefined}
          className={cn(
            'absolute top-full z-40 mt-1 rounded-xl border border-line-divider bg-surface shadow-floating',
            panelClassName ?? 'min-w-[200px] p-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface DropdownItemProps {
  icon?: ReactNode
  onClick: () => void
  children: ReactNode
  /** Contador/etiqueta opcional à direita (ex.: itens na fila). */
  badge?: ReactNode
}

export function DropdownItem({ icon, onClick, children, badge }: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
    >
      {icon && <span className="shrink-0 text-primary">{icon}</span>}
      <span className="flex-1 whitespace-nowrap">{children}</span>
      {badge != null && badge !== '' && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
    </button>
  )
}
