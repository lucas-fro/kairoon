import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/format'

export interface SelectMenuOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectMenuProps {
  value: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  label?: string
  /** Nome acessível quando não há `label` visível (ex.: selects compactos em toolbars). */
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

interface MenuRect {
  left: number
  top: number
  width: number
  openUp: boolean
}

/**
 * Select customizado: o gatilho abre uma lista de opções; clicar seleciona.
 * Opções `disabled` aparecem em cinza e não são clicáveis. O dropdown é
 * renderizado em portal (fixed) para não ser cortado dentro de modais.
 */
export function SelectMenu({
  value,
  onChange,
  options,
  label,
  ariaLabel,
  placeholder = 'Selecione…',
  disabled,
  className,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [rect, setRect] = useState<MenuRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  function updatePosition() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < 240 && r.top > spaceBelow
    // Trava horizontal: nunca deixa o menu nascer fora da viewport (ex.: perto
    // da borda direita numa tabela/área com scroll lateral).
    const left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8))
    setRect({ left, top: openUp ? r.top : r.bottom, width: r.width, openUp })
  }

  useLayoutEffect(() => {
    if (open) updatePosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    setActiveIndex(options.findIndex((o) => o.value === value))

    // Ao rolar/redimensionar, reposiciona o menu para acompanhar o gatilho
    // (capture=true também pega o scroll de dentro do modal). Não reposiciona
    // quando o scroll vem de dentro da própria lista de opções.
    function reposition(e?: Event) {
      if (e && menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return
      }
      updatePosition()
    }
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDocClick)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDocClick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function selectAt(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    setOpen(false)
  }

  function moveActive(direction: 1 | -1) {
    if (options.length === 0) return
    let index = activeIndex
    for (let i = 0; i < options.length; i++) {
      index = (index + direction + options.length) % options.length
      if (!options[index].disabled) {
        setActiveIndex(index)
        return
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectAt(activeIndex)
    }
  }

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-2 block text-[13px] font-medium text-ink-secondary">{label}</label>
      )}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3 text-left text-sm transition-shadow duration-150',
          'focus:outline-none focus:ring-[3px] focus:ring-secondary-light',
          'disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled',
          open ? 'border-secondary ring-[3px] ring-secondary-light' : 'border-line',
        )}
      >
        <span className={cn('truncate', selected ? 'text-ink' : 'text-ink-tertiary')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-ink-tertiary transition-transform duration-150',
            open && 'rotate-180',
          )}
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: rect.left,
              width: rect.width,
              ...(rect.openUp
                ? { bottom: window.innerHeight - rect.top + 4 }
                : { top: rect.top + 4 }),
            }}
            className="thin-scrollbar z-[70] max-h-64 overflow-y-auto rounded-xl border border-line-divider bg-surface p-1 shadow-floating"
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-ink-tertiary">Nenhuma opção</p>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === value
                const isActive = index === activeIndex
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onClick={() => selectAt(index)}
                    onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      option.disabled
                        ? 'cursor-not-allowed bg-background text-ink-tertiary line-through'
                        : isSelected
                          ? 'bg-secondary-light font-medium text-primary'
                          : isActive
                            ? 'bg-surface-hover text-ink'
                            : 'text-ink-secondary',
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && !option.disabled && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                )
              })
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
