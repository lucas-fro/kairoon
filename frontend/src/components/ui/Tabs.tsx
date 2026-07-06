import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/format'

export interface TabItem {
  key: string
  label: string
  icon?: LucideIcon
}

interface TabsProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  className?: string
}

/** Tabs em underline (indicador 2px primary), roláveis no mobile */
export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'thin-scrollbar flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line-divider',
        className,
      )}
      role="tablist"
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
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors duration-150',
              isActive
                ? 'border-primary font-semibold text-primary'
                : 'border-transparent font-medium text-ink-tertiary hover:text-ink-secondary',
            )}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
