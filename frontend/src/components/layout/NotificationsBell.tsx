import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarClock, CheckCheck } from 'lucide-react'
import { listAppointments } from '../../api/appointments'
import { addDays, todayStr } from '../../lib/dates'
import { formatDate } from '../../lib/format'
import type { Appointment } from '../../types/api'
import { useDropdown } from '../../hooks/useDropdown'
import {
  PendingAppointmentDialog,
  toPendingView,
} from '../realtime/PendingAppointmentDialog'
import type { PendingAppointmentView } from '../realtime/PendingAppointmentDialog'
import { Spinner } from '../ui/Spinner'

function byDateTime(a: Appointment, b: Appointment) {
  return a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
}

export function NotificationsBell() {
  const { open, setOpen, ref } = useDropdown()
  const [selected, setSelected] = useState<PendingAppointmentView | null>(null)

  const today = todayStr()
  const query = useQuery({
    queryKey: ['appointments', 'pending', today],
    // Agendamentos do link público sempre são futuros; janela larga cobre todos.
    queryFn: () => listAppointments({ start: today, end: addDays(today, 365), status: 'pending' }),
    refetchInterval: 45000,
  })

  const pending = (query.data ?? []).slice().sort(byDateTime)
  const count = pending.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-background"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-divider bg-surface shadow-floating">
          <div className="flex items-center justify-between border-b border-line-divider px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notificações</p>
            {count > 0 && (
              <span className="text-xs font-medium text-ink-tertiary">
                {count} a aprovar
              </span>
            )}
          </div>

          <div className="thin-scrollbar max-h-96 overflow-y-auto">
            {query.isPending ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            ) : count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <CheckCheck className="h-6 w-6 text-ink-tertiary" strokeWidth={1.7} />
                <p className="text-sm text-ink-secondary">Tudo em dia! Nenhuma notificação.</p>
              </div>
            ) : (
              pending.map((appointment) => (
                <button
                  key={appointment.id}
                  type="button"
                  onClick={() => {
                    setSelected(toPendingView(appointment))
                    setOpen(false)
                  }}
                  className="flex w-full items-start gap-3 border-b border-line-divider px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-hover"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-light text-warning-dark">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">Agendamento a aprovar</p>
                    <p className="truncate text-xs text-ink-secondary">
                      {appointment.client.name} · {appointment.service.name}
                    </p>
                    <p className="text-xs text-ink-tertiary">
                      {formatDate(appointment.date)} · {appointment.startTime}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected && (
        <PendingAppointmentDialog
          appointment={selected}
          onClose={() => setSelected(null)}
          onResolved={() => setSelected(null)}
        />
      )}
    </div>
  )
}
