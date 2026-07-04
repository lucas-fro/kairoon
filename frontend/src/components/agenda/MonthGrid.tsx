import { useMemo } from 'react'
import { MONTH_LABELS, WEEKDAY_LABELS_SHORT, addDays, getDayOfWeek, todayStr } from '../../lib/dates'
import { cn } from '../../lib/format'
import type { Appointment } from '../../types/api'

interface MonthGridProps {
  /** Qualquer data dentro do mês exibido ('YYYY-MM-DD') */
  monthRef: string
  appointments: Appointment[]
  onSelectDay: (date: string) => void
}

/** Primeiro domingo da grade que contém o mês (6 semanas) */
function monthGridStart(monthRef: string): string {
  const firstOfMonth = `${monthRef.slice(0, 7)}-01`
  return addDays(firstOfMonth, -getDayOfWeek(firstOfMonth))
}

export function MonthGrid({ monthRef, appointments, onSelectDay }: MonthGridProps) {
  const today = todayStr()
  const currentMonth = monthRef.slice(0, 7)

  const days = useMemo(() => {
    const start = monthGridStart(monthRef)
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [monthRef])

  const countByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const appointment of appointments) {
      if (appointment.status === 'cancelled') continue
      map.set(appointment.date, (map.get(appointment.date) ?? 0) + 1)
    }
    return map
  }, [appointments])

  return (
    <div className="overflow-hidden rounded-xl bg-surface shadow-card">
      <div className="grid grid-cols-7 border-b border-line-divider">
        {WEEKDAY_LABELS_SHORT.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-[11px] font-medium text-ink-tertiary">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const inMonth = date.slice(0, 7) === currentMonth
          const isToday = date === today
          const count = countByDay.get(date) ?? 0
          const dayNumber = Number(date.slice(8, 10))
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelectDay(date)}
              className={cn(
                'flex min-h-[92px] flex-col border-b border-r border-line-divider p-2 text-left transition-colors duration-150 hover:bg-surface-hover',
                !inMonth && 'bg-background/60',
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold',
                  isToday ? 'bg-primary text-white' : inMonth ? 'text-ink' : 'text-ink-tertiary',
                )}
              >
                {dayNumber}
              </span>
              {count > 0 && (
                <span className="mt-auto inline-flex w-fit items-center rounded-md bg-secondary-light px-2 py-0.5 text-[11px] font-medium text-primary">
                  {count} {count === 1 ? 'agend.' : 'agends.'}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="px-4 py-2 text-center text-xs text-ink-tertiary">
        {MONTH_LABELS[Number(currentMonth.slice(5, 7)) - 1]} de {currentMonth.slice(0, 4)} · clique
        em um dia para ver a semana
      </div>
    </div>
  )
}
