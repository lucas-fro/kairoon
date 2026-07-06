import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  CalendarDays,
  CalendarX,
  Clock,
  Pencil,
  UserX,
  Wallet,
} from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { getClient, updateClient } from '../../api/clients'
import type { ClientPayload } from '../../api/clients'
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
import { formatBRL, formatDate, formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['client', id],
    queryFn: () => getClient(id!),
    enabled: Boolean(id),
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
