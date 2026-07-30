import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { Banknote, Calendar, Clock, MapPin, Scissors, User } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createBooking } from '../../api/public'
import { minutesToTime, timeToMinutes } from '../../lib/dates'
import { formatBRL, formatDateLong, onlyDigits } from '../../lib/format'
import type { BookingResult } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent } from '../ui/Card'
import { useToast } from '../ui/Toast'
import type { PublicEmployee, PublicService } from './types'

interface ConfirmStepProps {
  slug: string
  establishmentName: string
  service: PublicService
  employee: PublicEmployee | null
  date: string
  startTime: string
  clientName: string
  clientPhone: string
  clientEmail: string
  clientBirthDate: string
  clientGender: string
  onSuccess: (result: BookingResult) => void
  onSlotTaken: () => void
  /**
   * Envio alternativo do agendamento. Existe para a apresentação
   * (/apresentacao) reusar esta etapa sem criar nada de verdade.
   */
  submit?: () => Promise<BookingResult>
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
    <div className="flex items-center gap-3 py-3">
      <Icon className="h-[18px] w-[18px] shrink-0 text-ink-tertiary" strokeWidth={1.9} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink-secondary">{label}</p>
        <div className="text-sm font-medium text-ink">{children}</div>
      </div>
    </div>
  )
}

export function ConfirmStep({
  slug,
  establishmentName,
  service,
  employee,
  date,
  startTime,
  clientName,
  clientPhone,
  clientEmail,
  clientBirthDate,
  clientGender,
  onSuccess,
  onSlotTaken,
  submit,
}: ConfirmStepProps) {
  const toast = useToast()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const endTime = minutesToTime(timeToMinutes(startTime) + service.durationMinutes)

  const mutation = useMutation({
    mutationFn: () =>
      submit?.() ??
      createBooking(slug, {
        serviceId: service.id,
        employeeId: employee?.id,
        date,
        startTime,
        client: {
          name: clientName,
          phone: onlyDigits(clientPhone),
          ...(clientEmail ? { email: clientEmail } : {}),
          ...(clientBirthDate ? { birthDate: clientBirthDate } : {}),
          ...(clientGender ? { gender: clientGender } : {}),
        },
      }),
    onSuccess: (result) => onSuccess(result),
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message || 'Esse horário acabou de ser reservado. Escolha outro.')
        onSlotTaken()
        return
      }
      setErrorMessage(err instanceof ApiError ? err.message : 'Erro inesperado')
    },
  })

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Card>
        <CardContent className="divide-y divide-line-divider px-6 py-2">
          <SummaryRow icon={Scissors} label="Serviço">
            {service.name}
          </SummaryRow>
          <SummaryRow icon={Calendar} label="Data">
            <span className="first-letter:uppercase">{formatDateLong(date)}</span>
          </SummaryRow>
          <SummaryRow icon={Clock} label="Horário">
            {startTime} – {endTime}
          </SummaryRow>
          {employee && (
            <SummaryRow icon={User} label="Profissional">
              {employee.name}
            </SummaryRow>
          )}
          <SummaryRow icon={Banknote} label="Valor">
            <span className="font-display text-base font-semibold text-primary">
              {formatBRL(service.priceCents)}
            </span>
          </SummaryRow>
          <SummaryRow icon={MapPin} label="Local">
            {establishmentName}
          </SummaryRow>
        </CardContent>
      </Card>

      {errorMessage && (
        <div className="rounded-lg bg-error-light px-4 py-3 text-sm text-error-dark">
          {errorMessage}
        </div>
      )}

      <div className="mt-auto pt-2">
        <Button
          size="lg"
          className="w-full"
          isLoading={mutation.isPending}
          onClick={() => {
            setErrorMessage(null)
            mutation.mutate()
          }}
        >
          Confirmar agendamento
        </Button>
      </div>
    </div>
  )
}
