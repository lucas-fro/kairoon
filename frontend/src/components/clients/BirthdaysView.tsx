import { useQuery } from '@tanstack/react-query'
import { Cake, PartyPopper } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listBirthdays } from '../../api/clients'
import { cn, formatDate, formatPhone, onlyDigits } from '../../lib/format'
import type { BirthdayClient } from '../../types/api'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { SkeletonList } from '../ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { ClientAvatar } from './ClientAvatar'

/** '1990-07-23' → '23/07' */
function dayMonth(birthDate: string): string {
  const [, month, day] = birthDate.split('-')
  return `${day}/${month}`
}

function whenLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Hoje'
  if (daysUntil === 1) return 'Amanhã'
  return `Em ${daysUntil} dias`
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
      <span className="hidden sm:inline">Parabenizar</span>
    </a>
  )
}

export function BirthdaysView() {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useQuery({
    // 'insights' isola do key da busca (['clients', <termo>]) — evita colisão de
    // cache se alguém digitar "birthdays" na busca da Listagem.
    queryKey: ['clients', 'insights', 'birthdays'],
    queryFn: listBirthdays,
  })

  const clients = data ?? []
  const todayList = clients.filter((c) => c.isToday)
  const goToClient = (client: BirthdayClient) => navigate(`/app/clientes/${client.id}`)

  return (
    <div>
      <PageHeader
        title="Aniversários"
        description="Aniversariantes em ordem de proximidade — celebre e traga seus clientes de volta."
      />

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : isError ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-ink-secondary">Não foi possível carregar os aniversários.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Cake}
          title="Nenhum aniversário cadastrado"
          description="Cadastre a data de nascimento dos seus clientes para vê-los aqui."
        />
      ) : (
        <div className="space-y-4">
          {todayList.length > 0 && (
            <Card className="border-secondary/40 bg-secondary-light/40 p-4">
              <div className="flex items-center gap-2">
                <PartyPopper className="h-5 w-5 text-secondary" />
                <h2 className="font-display text-[15px] font-semibold text-ink">
                  {todayList.length === 1
                    ? '1 aniversariante hoje'
                    : `${todayList.length} aniversariantes hoje`}
                </h2>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {todayList.map((client) => (
                  <button
                    key={client.id}
                    type="button"
                    onClick={() => goToClient(client)}
                    className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-medium text-ink transition-colors hover:bg-surface-hover"
                  >
                    <ClientAvatar name={client.name} />
                    {client.name}
                    <span className="text-xs font-normal text-ink-tertiary">
                      faz {client.turningAge}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Desktop: tabela */}
          <Card className="hidden overflow-hidden md:block">
            <Table>
              <THead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Aniversário</Th>
                  <Th>Idade</Th>
                  <Th>Última visita</Th>
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
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="text-ink">{dayMonth(client.birthDate)}</span>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            client.isToday
                              ? 'bg-secondary text-white'
                              : 'bg-surface-hover text-ink-secondary',
                          )}
                        >
                          {whenLabel(client.daysUntil)}
                        </span>
                      </div>
                    </Td>
                    <Td className="text-ink-secondary">faz {client.turningAge} anos</Td>
                    <Td className="text-ink-secondary">
                      {client.lastVisit ? formatDate(client.lastVisit) : 'Nunca veio'}
                    </Td>
                    <Td className="text-right">
                      <WhatsAppButton phone={client.phone} label={`Parabenizar ${client.name}`} />
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
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      client.isToday
                        ? 'bg-secondary text-white'
                        : 'bg-surface-hover text-ink-secondary',
                    )}
                  >
                    {whenLabel(client.daysUntil)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-divider pt-3">
                  <div className="min-w-0 text-xs text-ink-tertiary">
                    <p>
                      {dayMonth(client.birthDate)} · faz {client.turningAge} anos
                    </p>
                    <p>
                      Última visita: {client.lastVisit ? formatDate(client.lastVisit) : 'nunca veio'}
                    </p>
                  </div>
                  <WhatsAppButton phone={client.phone} label={`Parabenizar ${client.name}`} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
