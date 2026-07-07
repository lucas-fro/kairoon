import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  CalendarDays,
  CalendarX,
  Clock,
  Coins,
  Gift,
  Pencil,
  Stamp,
  UserX,
  Wallet,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { getClient, updateClient } from '../../api/clients'
import type { ClientPayload } from '../../api/clients'
import { listClientCoupons } from '../../api/coupons'
import { getClientLoyalty, redeemLoyalty } from '../../api/loyalty'
import { getClientPoints, redeemPoints } from '../../api/points'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { DialogActions } from '../../components/ui/DialogActions'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { PageLoader } from '../../components/ui/Spinner'
import { useToast } from '../../components/ui/Toast'
import { describeCouponDiscount, describeCouponValidity } from '../../lib/coupons'
import { cn, formatBRL, formatDate, formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
import type { AppointmentStatus, Client } from '../../types/api'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

const GENDER_LABEL: Record<string, string> = {
  masculino: 'Masculino',
  feminino: 'Feminino',
  outro: 'Outro',
}

const STATUS_BADGE: Record<
  AppointmentStatus,
  { label: string; tone: 'success' | 'brand' | 'error' | 'warning' }
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  completed: { label: 'Concluído', tone: 'brand' },
  pending: { label: 'Pendente', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'error' },
}

interface EditClientDialogProps {
  open: boolean
  onClose: () => void
  client: Client
}

function EditClientDialog({ open, onClose, client }: EditClientDialogProps) {
  const [name, setName] = useState(client.name)
  const [phone, setPhone] = useState(formatPhone(client.phone))
  const [email, setEmail] = useState(client.email ?? '')
  const [birthDate, setBirthDate] = useState(client.birthDate ?? '')
  const [gender, setGender] = useState(client.gender ?? '')
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const queryClient = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setName(client.name)
      setPhone(formatPhone(client.phone))
      setEmail(client.email ?? '')
      setBirthDate(client.birthDate ?? '')
      setGender(client.gender ?? '')
      setErrors({})
    }
  }, [open, client])

  const mutation = useMutation({
    mutationFn: (data: ClientPayload) => updateClient(client.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', client.id] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente atualizado com sucesso!')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
    },
  })

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const nextErrors: { name?: string; phone?: string } = {}
    if (!name.trim()) nextErrors.name = 'Informe o nome do cliente'
    if (!isValidPhone(phone)) nextErrors.phone = 'Informe um telefone válido com DDD'
    setErrors(nextErrors)
    if (nextErrors.name || nextErrors.phone) return
    mutation.mutate({
      name: name.trim(),
      phone: onlyDigits(phone),
      email: email.trim(),
      birthDate,
      gender,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Editar cliente" maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Nome"
          placeholder="Ex.: João da Silva"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Input
          label="Telefone"
          type="tel"
          inputMode="tel"
          placeholder="(11) 98765-4321"
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          error={errors.phone}
        />
        <Input
          label="E-mail (opcional)"
          type="email"
          placeholder="nome@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Nascimento (opcional)"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
          <Select label="Sexo (opcional)" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">Não informar</option>
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
            <option value="outro">Outro</option>
          </Select>
        </div>
        <DialogActions className="pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            Salvar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-ink-secondary">{label}</p>
          <p className="truncate font-display text-xl font-bold text-ink">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function BackLink() {
  return (
    <Link
      to="/app/clientes"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-tertiary transition-colors duration-150 hover:text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      Voltar para clientes
    </Link>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [editOpen, setEditOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: Boolean(id),
  })

  const loyaltyQuery = useQuery({
    queryKey: ['loyalty', 'client', id],
    queryFn: () => getClientLoyalty(id!),
    enabled: Boolean(id),
  })
  const pointsQuery = useQuery({
    queryKey: ['points', 'client', id],
    queryFn: () => getClientPoints(id!),
    enabled: Boolean(id),
  })
  const couponsQuery = useQuery({
    queryKey: ['coupons', 'client', id],
    queryFn: () => listClientCoupons(id!),
    enabled: Boolean(id),
  })

  const invalidateFidelity = () => {
    queryClient.invalidateQueries({ queryKey: ['loyalty'] })
    queryClient.invalidateQueries({ queryKey: ['points'] })
    queryClient.invalidateQueries({ queryKey: ['coupons'] })
  }

  const redeemLoyaltyMutation = useMutation({
    mutationFn: () => redeemLoyalty(id!),
    onSuccess: ({ coupon }) => {
      invalidateFidelity()
      toast.success(`Recompensa resgatada! Cupom ${coupon.code} criado para este cliente.`)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao resgatar')
    },
  })

  const redeemPointsMutation = useMutation({
    mutationFn: (rewardId: string) => redeemPoints(id!, rewardId),
    onSuccess: ({ coupon }) => {
      invalidateFidelity()
      toast.success(`Pontos resgatados! Cupom ${coupon.code} criado para este cliente.`)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao resgatar')
    },
  })

  if (isLoading) {
    return <PageLoader label="Carregando cliente…" />
  }

  if (isError || !data || !id) {
    return (
      <div>
        <div className="mb-6">
          <BackLink />
        </div>
        <EmptyState
          icon={UserX}
          title="Cliente não encontrado"
          description="O cliente que você procura não existe ou foi removido."
          action={<BackLink />}
        />
      </div>
    )
  }

  const { client, stats, history } = data

  return (
    <div>
      <div className="mb-6">
        <BackLink />
      </div>

      {/* Cabeçalho do cliente */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-display text-xl font-semibold text-primary">
              {getInitials(client.name)}
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-semibold text-ink">
                {client.name}
              </h1>
              <p className="text-sm text-ink-secondary">{formatPhone(client.phone)}</p>
              {client.email && (
                <p className="truncate text-sm text-ink-secondary">{client.email}</p>
              )}
              <p className="mt-0.5 text-xs text-ink-tertiary">
                Cliente desde {formatDate(client.createdAt.slice(0, 10))}
                {client.birthDate ? ` · Nasc. ${formatDate(client.birthDate)}` : ''}
                {client.gender ? ` · ${GENDER_LABEL[client.gender] ?? client.gender}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditOpen(true)}
            >
              Editar
            </Button>
            <a
              href={`https://wa.me/55${onlyDigits(client.phone)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
            >
              <img src="/whatsapp.svg" alt="" className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Valor pendente (dívida acumulada em fechamentos anteriores) */}
      {stats.outstandingDebtCents > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-warning/40 bg-warning-light/50 px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/15">
            <Wallet className="h-5 w-5 text-warning-dark" />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] text-ink-secondary">Valor pendente a pagar</p>
            <p className="font-display text-xl font-bold text-warning-dark">
              {formatBRL(stats.outstandingDebtCents)}
            </p>
          </div>
        </div>
      )}

      {/* Estatísticas */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Wallet} label="Total gasto" value={formatBRL(stats.totalSpentCents)} />
        <StatCard icon={CalendarDays} label="Atendimentos" value={String(stats.appointmentsCount)} />
        <StatCard
          icon={Clock}
          label="Última visita"
          value={stats.lastVisit ? formatDate(stats.lastVisit) : '—'}
        />
      </div>

      {/* Fidelidade: carimbos, pontos e cupons disponíveis */}
      {(() => {
        const loyalty = loyaltyQuery.data
        const points = pointsQuery.data
        const clientCoupons = couponsQuery.data ?? []
        const showLoyalty = Boolean(loyalty?.program?.active)
        const showPoints = Boolean(points?.program?.active)
        if (!showLoyalty && !showPoints && clientCoupons.length === 0) return null
        return (
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {showLoyalty && loyalty?.program && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Stamp className="h-4 w-4 text-primary" /> Cartão fidelidade
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-2xl font-bold text-ink">
                      {loyalty.availableStamps}
                    </span>
                    <span className="text-sm text-ink-secondary">
                      / {loyalty.program.stampsRequired} carimbos
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: loyalty.program.stampsRequired }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-2.5 w-2.5 rounded-full',
                          i < Math.min(loyalty.availableStamps, loyalty.program!.stampsRequired)
                            ? 'bg-primary'
                            : 'bg-ink-disabled/40',
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-ink-tertiary">
                    Recompensa:{' '}
                    {describeCouponDiscount(loyalty.program.rewardType, loyalty.program.rewardValue)}
                  </p>
                  <Button
                    size="sm"
                    disabled={!loyalty.canRedeem}
                    isLoading={redeemLoyaltyMutation.isPending}
                    onClick={() => redeemLoyaltyMutation.mutate()}
                  >
                    Resgatar recompensa
                  </Button>
                </CardContent>
              </Card>
            )}

            {showPoints && points && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" /> Pontos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-2xl font-bold text-ink">
                      {points.balance}
                    </span>
                    <span className="text-sm text-ink-secondary">pontos</span>
                  </div>
                  {points.rewards.length === 0 ? (
                    <p className="text-xs text-ink-tertiary">
                      Nenhuma recompensa cadastrada em Fidelidade → Pontos.
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {points.rewards.map((reward) => (
                        <li
                          key={reward.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{reward.name}</p>
                            <p className="text-xs text-ink-tertiary">
                              {reward.costPoints} pts ·{' '}
                              {describeCouponDiscount(reward.rewardType, reward.rewardValue)}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={points.balance < reward.costPoints}
                            isLoading={
                              redeemPointsMutation.isPending &&
                              redeemPointsMutation.variables === reward.id
                            }
                            onClick={() => redeemPointsMutation.mutate(reward.id)}
                          >
                            Resgatar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gift className="h-4 w-4 text-primary" /> Cupons disponíveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {clientCoupons.length === 0 ? (
                  <p className="text-sm text-ink-tertiary">
                    Nenhum cupom disponível. Recompensas resgatadas aparecem aqui.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {clientCoupons.map((coupon) => (
                      <li
                        key={coupon.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono font-medium text-ink">{coupon.code}</p>
                          <p className="text-xs text-ink-tertiary">
                            {coupon.name ? `${coupon.name} · ` : ''}
                            {describeCouponValidity(coupon.validFrom, coupon.validUntil)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-primary">
                          {describeCouponDiscount(coupon.discountType, coupon.discountValue)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de agendamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
              <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <CalendarX className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-display text-[15px] font-semibold text-ink">
                Nenhum agendamento ainda
              </h3>
              <p className="max-w-sm text-sm text-ink-secondary">
                O histórico de agendamentos deste cliente aparecerá aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-divider">
              {history.map((item) => {
                const status = STATUS_BADGE[item.status]
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{item.serviceName}</p>
                      <p className="text-xs text-ink-tertiary">
                        {formatDate(item.date)} às {item.startTime} · {item.employeeName}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      {item.createdVia === 'public' && <Badge tone="info">Link público</Badge>}
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="text-sm font-semibold text-ink">
                        {formatBRL(item.priceCents)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <EditClientDialog open={editOpen} onClose={() => setEditOpen(false)} client={client} />
    </div>
  )
}
