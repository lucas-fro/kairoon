import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/format'
import { Tabs } from './Tabs'
import type { TabItem } from './Tabs'

interface SectionNavProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  children: ReactNode
}

/**
 * Navegação de seção interna.
 * - Mobile: tabs horizontais roláveis (underline).
 * - Desktop (lg+): segunda sidebar vertical à esquerda do conteúdo.
 *
 * O conteúdo é renderizado uma única vez; apenas a apresentação da navegação
 * muda conforme o breakpoint.
 */
export function SectionNav({ tabs, active, onChange, children }: SectionNavProps) {
  return (
    <div className="lg:flex lg:gap-8">
      {/* Mobile: tabs horizontais */}
      <div className="lg:hidden">
        <Tabs tabs={tabs} active={active} onChange={onChange} />
      </div>

      {/* Desktop: sidebar vertical */}
      <aside className="hidden shrink-0 lg:block lg:w-[224px]">
        <nav
          className="sticky top-4 space-y-0.5"
          role="tablist"
          aria-orientation="vertical"
        >
          {tabs.map((tab) => {
            const isActive = tab.key === active
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(tab.key)}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors duration-150',
                  isActive
                    ? 'bg-secondary-light font-semibold text-primary'
                    : 'font-medium text-ink-secondary hover:bg-secondary-light/50 hover:text-primary',
                )}
              >
                {tab.icon && (
                  <tab.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
                )}
                <span className="flex-1 text-left">{tab.label}</span>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 transition-all duration-150',
                    isActive
                      ? 'text-primary/70'
                      : 'text-ink-tertiary opacity-0 -translate-x-1 group-hover:translate-x-0 group-hover:opacity-100',
                  )}
                  strokeWidth={2}
                />
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Conteúdo */}
      <div className="mt-8 min-w-0 flex-1 lg:mt-0">{children}</div>
    </div>
  )
}
