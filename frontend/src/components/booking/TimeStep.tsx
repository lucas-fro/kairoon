import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarX2 } from 'lucide-react'
import { getAvailability } from '../../api/public'
import { cn, formatDateLong } from '../../lib/format'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Skeleton } from '../ui/Skeleton'

interface TimeStepProps {
  slug: string
  serviceId: string
  employeeId?: string
  date: string
  onSelect: (time: string) => void
  onPickAnotherDate: () => void
  /**
   * Origem alternativa dos horários livres. Existe para a página de remarcação
   * reusar esta etapa: lá a consulta vai pelo token do agendamento (e exclui o
   * horário atual do próprio cliente dos ocupados), não pelo serviço.
   */
  loadSlots?: () => Promise<{ slots: string[] }>
}

export function TimeStep({
  slug,
  serviceId,
  employeeId,
  date,
  onSelect,
  onPickAnotherDate,
  loadSlots,
}: TimeStepProps) {
  const [pendingSlot, setPendingSlot] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['availability', slug, serviceId, date, employeeId ?? 'any', Boolean(loadSlots)],
    queryFn: () => (loadSlots ? loadSlots() : getAvailability(slug, { serviceId, date, employeeId })),
  })

  function handlePick(slot: string) {
    setPendingSlot(slot)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSelect(slot), 150)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink-secondary first-letter:uppercase">
        {formatDateLong(date)}
      </p>

      {isLoading && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-ink-secondary">Não foi possível carregar os horários.</p>
          <Button variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {data && data.slots.length === 0 && (
        <EmptyState
          icon={CalendarX2}
          title="Sem horários livres neste dia"
          description="Escolha outra data para ver novas opções de horário."
          action={
            <Button variant="outline" onClick={onPickAnotherDate}>
              Escolher outra data
            </Button>
          }
        />
      )}

      {data && data.slots.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {data.slots.map((slot) => (
            <button
              key={slot}
              type="button"
              onClick={() => handlePick(slot)}
              className={cn(
                'h-10 rounded-lg border text-sm font-medium transition-colors duration-150',
                pendingSlot === slot
                  ? 'border-primary bg-primary text-white'
                  : 'border-line bg-surface text-ink-secondary hover:border-secondary hover:text-primary',
              )}
            >
              {slot}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
