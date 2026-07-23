import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { UserCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listLapsed } from '../../api/clients'
import { cn, formatBRL, formatDate, formatPhone, onlyDigits } from '../../lib/format'
import type { LapsedClient } from '../../types/api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { SkeletonList } from '../ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { ClientAvatar } from './ClientAvatar'

const FILTERS = [
  { days: 30, label: '30+ dias' },
  { days: 60, label: '60+ dias' },
  { days: 90, label: '90+ dias' },
  { days: 180, label: '6+ meses' },
]

function absenceLabel(days: number): string {
  if (days < 60) return `há ${days} dias`
  if (days < 365) return `há ${Math.floor(days / 30)} meses`
  const years = Math.floor(days / 365)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
}

function WhatsAppButton({ phone, label }: { phone: string; label: string }) {
  return (
    <a
      href={`https://wa.me/55${onlyDigits(phone)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-hover"
      aria-label={label}
    >
      <img src="/whatsapp.svg" alt="" className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Chamar</span>
    </a>
  )
}

export function LapsedView() {
  const navigate = useNavigate()
  const [minDays, setMinDays] = useState(30)

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    // 'insights' isola do key da busca (['clients', <termo>]) — ver BirthdaysView.
    queryKey: ['clients', 'insights', 'lapsed', minDays],
    queryFn: () => listLapsed(minDays),
    placeholderData: (prev) => prev,
  })

  const clients = data ?? []
  const goToClient = (client: LapsedClient) => navigate(`/app/clientes/${client.id}`)

  const filterChips = (
    <div className="inline-flex rounded-lg bg-surface-hover p-1">
      {FILTERS.map((filter) => (
        <button
          key={filter.days}
          type="button"
          onClick={() => setMinDays(filter.days)}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
            minDays === filter.days
              ? 'bg-surface text-ink shadow-card'
              : 'text-ink-secondary hover:text-ink',
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Sumidos"
        description="Clientes que já vieram mas não voltam há um tempo — do mais ausente ao menos ausente."
      />

      <div className="mb-4 overflow-x-auto">{filterChips}</div>

      <div className={cn(isPlaceholderData && 'opacity-60 transition-opacity')}>
        {isLoading ? (
          <SkeletonList rows={6} />
        ) : isError ? (
          <Card>
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-sm text-ink-secondary">
                Não foi possível carregar os clientes sumidos.
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          </Card>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Nenhum cliente sumido"
            description="Ninguém está ausente há mais que o período selecionado. Continue assim!"
          />
        ) : (
          <>
            {/* Desktop: tabela */}
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <THead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Última visita</Th>
                    <Th>Ausente</Th>
                    <Th>Total gasto</Th>
                    <Th> </Th>
                  </tr>
                </THead>
                <TBody>
                  {clients.map((client) => (
                    <Tr key={client.id} clickable onClick={() => goToClient(client)}>
                      <Td>
                        <div className="flex items-center gap-3">
                          <ClientAvatar name={client.name} />
                          <div>
                            <span className="font-medium text-ink">{client.name}</span>
                            <p className="text-xs text-ink-tertiary">{formatPhone(client.phone)}</p>
                          </div>
                        </div>
                      </Td>
                      <Td className="text-ink-secondary">{formatDate(client.lastVisit)}</Td>
                      <Td>
                        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-ink-secondary">
                          {absenceLabel(client.daysSince)}
                        </span>
                      </Td>
                      <Td className="font-medium text-ink">{formatBRL(client.totalSpentCents)}</Td>
                      <Td className="text-right">
                        <WhatsAppButton phone={client.phone} label={`Chamar ${client.name}`} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </Card>

            {/* Mobile: cards */}
            <div className="space-y-3 md:hidden">
              {clients.map((client) => (
                <Card
                  key={client.id}
                  onClick={() => goToClient(client)}
                  className="cursor-pointer p-4 transition-colors duration-150 hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <ClientAvatar name={client.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{client.name}</p>
                      <p className="text-xs text-ink-tertiary">{formatPhone(client.phone)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-ink-secondary">
                      {absenceLabel(client.daysSince)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line-divider pt-3">
                    <div className="text-xs text-ink-tertiary">
                      Última: {formatDate(client.lastVisit)} · {formatBRL(client.totalSpentCents)}
                    </div>
                    <WhatsAppButton phone={client.phone} label={`Chamar ${client.name}`} />
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
