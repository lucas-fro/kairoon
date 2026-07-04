import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MONTH_LABELS, WEEKDAY_LABELS_SHORT, parseDate, toDateStr, todayStr } from '../../lib/dates'
import { cn } from '../../lib/format'
import type { WorkingHour } from '../../types/api'

const MAX_MONTHS_AHEAD = 2

interface MiniCalendarProps {
  selected: string | null
  workingHours: WorkingHour[]
  onSelect: (date: string) => void
}

export function MiniCalendar({ selected, workingHours, onSelect }: MiniCalendarProps) {
  const today = todayStr()
  const base = parseDate(today)

  const [monthOffset, setMonthOffset] = useState(() => {
    if (!selected) return 0
    const sel = parseDate(selected)
    const diff =
      (sel.getFullYear() - base.getFullYear()) * 12 + (sel.getMonth() - base.getMonth())
    return Math.min(MAX_MONTHS_AHEAD, Math.max(0, diff))
  })

  const view = new Date(base.getFullYear(), base.getMonth() + monthOffset, 1)
  const viewYear = view.getFullYear()
  const viewMonth = view.getMonth()
  const firstWeekday = view.getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const closedWeekdays = new Set(
    workingHours.filter((wh) => wh.isClosed).map((wh) => wh.dayOfWeek),
  )

  // Células alinhadas ao domingo: nulls antes do dia 1 + dias do mês
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      toDateStr(new Date(viewYear, viewMonth, i + 1)),
    ),
  ]

  return (
    <div className="rounded-xl bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOffset((o) => Math.max(0, o - 1))}
          disabled={monthOffset === 0}
          aria-label="Mês anterior"
          className="rounded-lg p-2 text-ink-tertiary transition-colors duration-150 hover:bg-background hover:text-ink-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="font-display text-sm font-semibold text-ink">
          {MONTH_LABELS[viewMonth]} {viewYear}
        </p>
        <button
          type="button"
          onClick={() => setMonthOffset((o) => Math.min(MAX_MONTHS_AHEAD, o + 1))}
          disabled={monthOffset >= MAX_MONTHS_AHEAD}
          aria-label="Próximo mês"
          className="rounded-lg p-2 text-ink-tertiary transition-colors duration-150 hover:bg-background hover:text-ink-secondary disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAY_LABELS_SHORT.map((label) => (
          <span key={label} className="pb-1 text-[11px] font-medium text-ink-tertiary">
            {label}
          </span>
        ))}
        {cells.map((dateStr, index) => {
          if (!dateStr) return <span key={`empty-${index}`} />

          const day = Number(dateStr.slice(8))
          const isPast = dateStr < today
          const isClosed = closedWeekdays.has(index % 7)
          const isDisabled = isPast || isClosed
          const isToday = dateStr === today
          const isSelected = dateStr === selected

          return (
            <button
              key={dateStr}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelect(dateStr)}
              className={cn(
                'mx-auto flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150',
                isDisabled && 'cursor-not-allowed text-ink-disabled',
                !isPast && isClosed && 'line-through',
                !isDisabled && !isSelected && 'text-ink hover:bg-secondary-light',
                isSelected && 'bg-primary font-semibold text-white',
                isToday && !isSelected && 'ring-1 ring-secondary',
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-ink-tertiary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full ring-1 ring-secondary" />
          Hoje
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-ink-disabled" />
          Indisponível
        </span>
      </div>
    </div>
  )
}
