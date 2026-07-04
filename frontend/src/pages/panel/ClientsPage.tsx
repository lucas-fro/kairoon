import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Search, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { createClient, listClients } from '../../api/clients'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { DialogActions } from '../../components/ui/DialogActions'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { PageHeader } from '../../components/ui/PageHeader'
import { SkeletonList } from '../../components/ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { cn, formatBRL, formatDate, formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
import type { ClientListItem } from '../../types/api'

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0].charAt(0)
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : ''
  return `${first}${last}`.toUpperCase()
}

interface NewClientDialogProps {
  open: boolean
  onClose: () => void
}

function NewClientDialog({ open, onClose }: NewClientDialogProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState('')
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const queryClient = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (open) {
      setName('')
      setPhone('')
      setEmail('')
      setBirthDate('')
      setGender('')
      setErrors({})
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: createClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Cliente cadastrado com sucesso!')
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
    <Dialog
      open={open}
      onClose={onClose}
      title="Novo cliente"
      description="Cadastre um cliente manualmente para agendar por ele."
      maxWidth="max-w-md"
    >
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
            Cadastrar
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

function ClientAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
      {getInitials(name)}
    </div>
  )
}

export function ClientsPage() {
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const { data, isLoading, isError, refetch, isPlaceholderData } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => listClients(search || undefined),
    placeholderData: (prev) => prev,
  })

  const clients = data ?? []
  const hasSearch = search.length > 0

  const description = data
    ? `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} ${
        hasSearch ? (clients.length === 1 ? 'encontrado' : 'encontrados') : 'na sua base'
      }`
    : 'Sua base de clientes'

  const countLabel = data
    ? `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'}`
    : '—'

  const goToClient = (client: ClientListItem) => navigate(`/app/clientes/${client.id}`)

  const searchField = (
    <Input
      leftIcon={<Search className="h-4 w-4" />}
      placeholder="Buscar por nome ou telefone…"
      value={searchInput}
      onChange={(e) => setSearchInput(e.target.value)}
      aria-label="Buscar clientes"
    />
  )

  const errorBlock = (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-ink-secondary">Não foi possível carregar os clientes.</p>
      <Button variant="outline" onClick={() => refetch()}>
        Tentar novamente
      </Button>
    </div>
  )

  const emptyTitle = hasSearch ? 'Nenhum cliente encontrado' : 'Nenhum cliente ainda'
  const emptyDescription = hasSearch
    ? 'Tente buscar por outro nome ou telefone.'
    : 'Seus clientes aparecem aqui automaticamente no primeiro agendamento.'
  const emptyAction = hasSearch ? undefined : (
    <Button
      variant="outline"
      leftIcon={<Plus className="h-4 w-4" />}
      onClick={() => setDialogOpen(true)}
    >
      Cadastrar cliente
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Clientes"
        description={description}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setDialogOpen(true)}>
            Novo cliente
          </Button>
        }
      />

      {/* Busca (mobile) — no desktop ela vive no toolbar do card */}
      <div className="mb-4 md:hidden">{searchField}</div>

      {/* Desktop: card CRM com toolbar + tabela */}
      <Card
        className={cn(
          'hidden overflow-hidden md:block',
          isPlaceholderData && 'opacity-60 transition-opacity',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-line-divider px-6 py-4">
          <div className="w-full max-w-sm">{searchField}</div>
          <p className="shrink-0 text-[13px] text-ink-tertiary">{countLabel}</p>
        </div>

        {isLoading ? (
          <div className="p-6">
            <SkeletonList rows={6} />
          </div>
        ) : isError ? (
          errorBlock
        ) : clients.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-display text-[15px] font-semibold text-ink">{emptyTitle}</h3>
            <p className="max-w-sm text-sm text-ink-secondary">{emptyDescription}</p>
            {emptyAction && <div className="mt-4">{emptyAction}</div>}
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Cliente</Th>
                <Th>Telefone</Th>
                <Th>Agendamentos</Th>
                <Th>Última visita</Th>
                <Th>Total gasto</Th>
              </tr>
            </THead>
            <TBody>
              {clients.map((client) => (
                <Tr key={client.id} clickable onClick={() => goToClient(client)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <ClientAvatar name={client.name} />
                      <span className="font-medium text-ink">{client.name}</span>
                    </div>
                  </Td>
                  <Td>{formatPhone(client.phone)}</Td>
                  <Td>{client.appointmentsCount}</Td>
                  <Td>{client.lastVisit ? formatDate(client.lastVisit) : '—'}</Td>
                  <Td className="font-medium text-ink">{formatBRL(client.totalSpentCents)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {/* Mobile: cards empilhados */}
      <div className={cn('md:hidden', isPlaceholderData && 'opacity-60 transition-opacity')}>
        {isLoading ? (
          <SkeletonList rows={6} />
        ) : isError ? (
          <Card>{errorBlock}</Card>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : (
          <div className="space-y-3">
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
                  <ChevronRight className="h-5 w-5 shrink-0 text-ink-tertiary" />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line-divider pt-3 text-center">
                  <div>
                    <p className="text-xs text-ink-tertiary">Agendamentos</p>
                    <p className="text-sm font-medium text-ink">{client.appointmentsCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-tertiary">Última visita</p>
                    <p className="text-sm font-medium text-ink">
                      {client.lastVisit ? formatDate(client.lastVisit) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-tertiary">Total gasto</p>
                    <p className="text-sm font-medium text-ink">
                      {formatBRL(client.totalSpentCents)}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <NewClientDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  )
}
