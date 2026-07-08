import type { LucideIcon } from 'lucide-react'
import {
  Banknote,
  Calendar,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Scissors,
  User,
} from 'lucide-react'
import { cn, formatBRL, formatDateLong } from '../../lib/format'
import type { BookingResult, PublicBranding, PublicEstablishment } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { BrandBanner } from './BrandBanner'

interface SuccessStepProps {
  result: BookingResult
  establishment: PublicEstablishment['establishment']
  branding: PublicBranding
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
    `SUMMARY:${escapeIcsText(`${service.name} · ${establishment.name}`)}`,
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

function SummaryRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Icon className="h-[18px] w-[18px] shrink-0 text-ink-tertiary" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink-secondary">{label}</p>
        <div className="text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  )
}

export function SuccessStep({ result, establishment, branding }: SuccessStepProps) {
  const { appointment, service, employee } = result
  const isPending = appointment.status === 'pending'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">
        <BrandBanner
          brandColor={branding.brandColor}
          bannerImageUrl={branding.bannerImageUrl}
          logoUrl={establishment.logoUrl}
          name={establishment.name}
          rounded={false}
        />
      </div>

      {/* Miolo rolável (se não couber), para a página em si não ter scroll */}
      <div className="thin-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-5 pb-2">
        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-full',
              isPending ? 'bg-warning-light' : 'bg-success-light',
            )}
          >
            {isPending ? (
              <Clock className="h-7 w-7 text-warning-dark" />
            ) : (
              <CheckCircle2 className="h-7 w-7 text-success-dark" />
            )}
          </div>

          <h2 className="mt-3 font-display text-xl font-semibold text-ink">
            {isPending ? 'Agendamento enviado!' : 'Agendamento confirmado!'}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-ink-secondary">
            {isPending
              ? 'Aguarde a confirmação do estabelecimento. Você receberá um retorno em breve.'
              : 'Tudo certo! Confira os detalhes do seu horário abaixo.'}
          </p>
        </div>

        <Card className="mt-4">
          <CardContent className="divide-y divide-line-divider px-6 py-1.5">
            <SummaryRow icon={Scissors} label="Serviço">
              {service.name}
            </SummaryRow>
            <SummaryRow icon={Calendar} label="Data">
              <span className="first-letter:uppercase">{formatDateLong(appointment.date)}</span>
            </SummaryRow>
            <SummaryRow icon={Clock} label="Horário">
              {appointment.startTime} – {appointment.endTime}
            </SummaryRow>
            <SummaryRow icon={User} label="Profissional">
              {employee.name}
            </SummaryRow>
            <SummaryRow icon={Banknote} label="Valor">
              <span className="font-display text-base font-semibold text-primary">
                {formatBRL(service.priceCents)}
              </span>
            </SummaryRow>
          </CardContent>
        </Card>

        {!isPending && (
          <Button
            variant="outline"
            size="lg"
            className="mt-4 w-full border-secondary text-secondary-hover hover:border-secondary hover:bg-secondary-light/40 hover:text-secondary-hover"
            leftIcon={<CalendarPlus className="h-5 w-5" />}
            onClick={() => downloadIcs(result)}
          >
            Adicionar ao calendário
          </Button>
        )}
      </div>
    </div>
  )
}
