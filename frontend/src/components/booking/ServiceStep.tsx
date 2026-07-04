import { useEffect, useRef, useState } from 'react'
import { Clock, Package, Scissors } from 'lucide-react'
import { cn, formatBRL, formatDuration } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { EmptyState } from '../ui/EmptyState'
import type { PublicService } from './types'

interface ServiceStepProps {
  services: PublicService[]
  onSelect: (service: PublicService) => void
}

export function ServiceStep({ services, onSelect }: ServiceStepProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handlePick(service: PublicService) {
    setPendingId(service.id)
    clearTimeout(timerRef.current)
    // Pequeno delay para o feedback visual da seleção antes de avançar
    timerRef.current = setTimeout(() => onSelect(service), 150)
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="Nenhum serviço disponível"
        description="Este estabelecimento ainda não cadastrou serviços para agendamento online."
      />
    )
  }

  return (
    <div className="space-y-3">
      {services.map((service) => (
        <button
          key={service.id}
          type="button"
          onClick={() => handlePick(service)}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl bg-surface p-4 text-left shadow-card transition-shadow duration-200',
            pendingId === service.id ? 'ring-2 ring-secondary' : 'hover:shadow-soft',
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-ink">{service.name}</p>
              {service.isPackage && (
                <Badge tone="brand">
                  <Package className="h-3 w-3" /> Pacote
                </Badge>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-secondary">
              <Clock className="h-4 w-4 text-ink-tertiary" />
              {formatDuration(service.durationMinutes)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {service.originalPriceCents && (
              <p className="text-xs text-ink-tertiary line-through">
                {formatBRL(service.originalPriceCents)}
              </p>
            )}
            <span className="font-display font-semibold text-primary">
              {formatBRL(service.priceCents)}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
