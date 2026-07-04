import { CalendarPlus, CheckCircle2, Clock } from 'lucide-react'
import { formatDate } from '../../lib/format'
import type { BookingResult } from '../../types/api'
import { Button } from '../ui/Button'

interface SuccessStepProps {
  result: BookingResult
  onNewBooking: () => void
}

/** Escapa vírgulas/pontos-e-vírgulas conforme o formato iCalendar */
function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[,;]/g, (match) => `\\${match}`)
}

function downloadIcs(result: BookingResult) {
  const { appointment, service, employee, establishment } = result
  const toIcsDateTime = (time: string) =>
    `${appointment.date.replace(/-/g, '')}T${time.replace(':', '')}00`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kairoon//Agendamento Online//PT-BR',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@kairoon`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${toIcsDateTime(appointment.startTime)}`,
    `DTEND:${toIcsDateTime(appointment.endTime)}`,
    `SUMMARY:${escapeIcsText(`${service.name} — ${establishment.name}`)}`,
    `LOCATION:${escapeIcsText(establishment.name)}`,
    `DESCRIPTION:${escapeIcsText(`Profissional: ${employee.name}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'agendamento.ics'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function SuccessStep({ result, onNewBooking }: SuccessStepProps) {
  const { appointment, service } = result
  const isPending = appointment.status === 'pending'

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 py-12 text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full ${
          isPending ? 'bg-warning-light' : 'bg-success-light'
        }`}
      >
        {isPending ? (
          <Clock className="h-9 w-9 text-warning-dark" />
        ) : (
          <CheckCircle2 className="h-9 w-9 text-success-dark" />
        )}
      </div>

      <h2 className="font-display text-xl font-semibold text-ink">
        {isPending ? 'Agendamento enviado!' : 'Agendamento confirmado!'}
      </h2>
      <p className="text-sm text-ink-secondary">
        {service.name} · {formatDate(appointment.date)} · {appointment.startTime}
      </p>
      {isPending && (
        <p className="-mt-1 max-w-xs text-sm text-warning-dark">
          Aguarde a confirmação do estabelecimento. Você receberá um retorno em breve.
        </p>
      )}

      <div className="mt-4 flex w-full flex-col gap-2">
        {!isPending && (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            leftIcon={<CalendarPlus className="h-5 w-5" />}
            onClick={() => downloadIcs(result)}
          >
            Adicionar ao calendário
          </Button>
        )}
        <Button variant="ghost" size="lg" className="w-full" onClick={onNewBooking}>
          Fazer novo agendamento
        </Button>
      </div>
    </div>
  )
}
