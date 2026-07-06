import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, X } from 'lucide-react'
import { searchAppointments } from '../../api/appointments'
import { formatDate, formatPhone } from '../../lib/format'
import type { Appointment } from '../../types/api'

interface AppointmentSearchProps {
  onSelect: (appointment: Appointment) => void
}

/** Busca de agendamentos por nome ou telefone do cliente, com dropdown de resultados */
export function AppointmentSearch({ onSelect }: AppointmentSearchProps) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Debounce de 300ms
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), 300)
    return () => clearTimeout(timer)
  }, [input])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchQuery = useQuery({
    queryKey: ['appointment-search', query],
    queryFn: () => searchAppointments(query),
    enabled: query.length >= 2,
  })

  const results = searchQuery.data ?? []

  return (
    <div ref={boxRef} className="relative w-full sm:w-72">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-tertiary" />
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar agendamento…"
          className="h-8 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-[13px] text-ink placeholder:text-ink-tertiary focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light"
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput('')
              setQuery('')
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-ink-tertiary hover:text-ink-secondary"
            aria-label="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="absolute right-0 z-40 mt-2 max-h-80 w-full min-w-[20rem] overflow-y-auto rounded-xl border border-line-divider bg-surface shadow-elevated">
          {searchQuery.isPending ? (
            <p className="px-4 py-3 text-sm text-ink-tertiary">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-tertiary">Nenhum agendamento encontrado.</p>
          ) : (
            results.map((appointment) => (
              <button
                key={appointment.id}
                type="button"
                onClick={() => {
                  onSelect(appointment)
                  setOpen(false)
                }}
                className="flex w-full flex-col gap-0.5 border-b border-line-divider px-4 py-2.5 text-left transition-colors duration-150 last:border-0 hover:bg-surface-hover"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {appointment.client.name}
                  </span>
                  <span className="shrink-0 text-xs text-ink-tertiary">
                    {formatPhone(appointment.client.phone)}
                  </span>
                </div>
                <span className="text-xs text-ink-secondary">
                  {formatDate(appointment.date)} · {appointment.startTime} · {appointment.service.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
