import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Package, Pencil, Plus, Power, Scissors, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createService, deleteService, listServices, updateService } from '../../api/services'
import type { ServicePayload } from '../../api/services'
import { cn, formatBRL, formatDuration, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { PackageDiscountType, Service } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SkeletonList } from '../ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120]

export function ServicesTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['services'], queryFn: listServices })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [isPackage, setIsPackage] = useState(false)
  const [name, setName] = useState('')
  const [duration, setDuration] = useState('30')
  const [price, setPrice] = useState('')
  const [packageIds, setPackageIds] = useState<string[]>([])
  const [discountType, setDiscountType] = useState<PackageDiscountType>('percent')
  const [discountValue, setDiscountValue] = useState('')
  // '' = automático (usa a soma dos serviços); qualquer valor = duração manual
  const [packageDuration, setPackageDuration] = useState('')
  const [formErrors, setFormErrors] = useState<{
    name?: string
    price?: string
    pkg?: string
    duration?: string
  }>({})
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null)

  const services = query.data ?? []
  const serviceById = new Map(services.map((s) => [s.id, s]))
  // Um pacote só pode conter serviços simples (sem aninhar pacotes)
  const selectableServices = services.filter((s) => !s.isPackage)

  function resetForm() {
    setIsPackage(false)
    setName('')
    setDuration('30')
    setPrice('')
    setPackageIds([])
    setDiscountType('percent')
    setDiscountValue('')
    setPackageDuration('')
    setFormErrors({})
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(service: Service) {
    setEditing(service)
    setName(service.name)
    setFormErrors({})
    if (service.isPackage) {
      setIsPackage(true)
      setPackageIds(service.packageServiceIds ?? [])
      setDiscountType(service.packageDiscountType ?? 'percent')
      setDiscountValue(
        service.packageDiscountType === 'fixed'
          ? ((service.packageDiscountValue ?? 0) / 100).toFixed(2).replace('.', ',')
          : String(service.packageDiscountValue ?? 0),
      )
      // Se a duração salva bate com a soma dos itens, mantém em modo automático
      const compSum = (service.packageServiceIds ?? []).reduce(
        (acc, id) => acc + (serviceById.get(id)?.durationMinutes ?? 0),
        0,
      )
      setPackageDuration(service.durationMinutes === compSum ? '' : String(service.durationMinutes))
      setDuration('30')
      setPrice('')
    } else {
      setIsPackage(false)
      setDuration(String(service.durationMinutes))
      setPrice((service.priceCents / 100).toFixed(2).replace('.', ','))
      setPackageIds([])
      setDiscountValue('')
      setPackageDuration('')
    }
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: createService,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Serviço criado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ServicePayload }) => updateService(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Serviço atualizado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const toggleMutation = useMutation({
    mutationFn: (service: Service) => updateService(service.id, { active: !service.active }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success(updated.active ? 'Serviço ativado!' : 'Serviço desativado.')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
      toast.success('Serviço excluído.')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
      setDeleteTarget(null)
    },
  })

  function togglePackageId(id: string) {
    setPackageIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Prévia do pacote (soma, desconto, preço final)
  const selectedForPackage = packageIds
    .map((id) => serviceById.get(id))
    .filter((s): s is Service => Boolean(s))
  const sumCents = selectedForPackage.reduce((acc, s) => acc + s.priceCents, 0)
  const sumDuration = selectedForPackage.reduce((acc, s) => acc + s.durationMinutes, 0)
  const rawDiscountCents =
    discountType === 'percent'
      ? Math.round((sumCents * Math.min(Number(onlyDigits(discountValue)) || 0, 100)) / 100)
      : parseBRLToCents(discountValue)
  const discountCents = Math.min(Math.max(0, rawDiscountCents), sumCents)
  const packageFinalCents = sumCents - discountCents
  const discountPct = sumCents > 0 ? Math.round((discountCents / sumCents) * 100) : 0
  // '' = usa a soma; senão o valor digitado
  const displayDuration = packageDuration === '' ? String(sumDuration) : packageDuration

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (isPackage) {
      const durationMinutes = packageDuration.trim() === '' ? sumDuration : Number(packageDuration)
      const nextErrors: typeof formErrors = {}
      if (!name.trim()) nextErrors.name = 'Informe o nome do pacote'
      if (packageIds.length < 2) nextErrors.pkg = 'Selecione pelo menos 2 serviços'
      if (durationMinutes < 5) nextErrors.duration = 'Duração mínima de 5 minutos'
      setFormErrors(nextErrors)
      if (Object.keys(nextErrors).length > 0) return

      const value =
        discountType === 'percent'
          ? Math.min(Number(onlyDigits(discountValue)) || 0, 100)
          : parseBRLToCents(discountValue)

      const payload: ServicePayload = {
        name: name.trim(),
        isPackage: true,
        durationMinutes,
        packageServiceIds: packageIds,
        packageDiscountType: discountType,
        packageDiscountValue: value,
      }
      if (editing) updateMutation.mutate({ id: editing.id, data: payload })
      else createMutation.mutate(payload)
      return
    }

    const nextErrors: typeof formErrors = {}
    const priceCents = parseBRLToCents(price)
    if (!name.trim()) nextErrors.name = 'Informe o nome do serviço'
    if (priceCents <= 0) nextErrors.price = 'Informe um preço válido'
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: ServicePayload = {
      name: name.trim(),
      isPackage: false,
      durationMinutes: Number(duration),
      priceCents,
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: payload })
    else createMutation.mutate(payload)
  }

  const durationOptions =
    editing && !editing.isPackage && !DURATION_OPTIONS.includes(editing.durationMinutes)
      ? [...DURATION_OPTIONS, editing.durationMinutes].sort((a, b) => a - b)
      : DURATION_OPTIONS

  const isSaving = createMutation.isPending || updateMutation.isPending

  function packageComponents(service: Service): string {
    return (service.packageServiceIds ?? [])
      .map((id) => serviceById.get(id)?.name)
      .filter(Boolean)
      .join(' + ')
  }

  function packageOriginal(service: Service): number {
    return (service.packageServiceIds ?? []).reduce(
      (sum, id) => sum + (serviceById.get(id)?.priceCents ?? 0),
      0,
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-secondary">
          Serviços e pacotes aparecem no seu link público e na agenda.
        </p>
        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
          Novo serviço
        </Button>
      </div>

      {query.isPending && <SkeletonList rows={4} />}

      {query.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar os serviços.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!query.isPending && !query.isError && services.length === 0 && (
        <EmptyState
          icon={Scissors}
          title="Nenhum serviço cadastrado"
          description="Cadastre seu primeiro serviço para que os clientes possam agendar."
          action={
            <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
              Novo serviço
            </Button>
          }
        />
      )}

      {!query.isPending && !query.isError && services.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Nome</Th>
                <Th>Duração</Th>
                <Th>Preço</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {services.map((service) => {
                const original = service.isPackage ? packageOriginal(service) : 0
                return (
                  <Tr key={service.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{service.name}</span>
                        {service.isPackage && (
                          <Badge tone="brand">
                            <Package className="h-3 w-3" /> Pacote
                          </Badge>
                        )}
                      </div>
                      {service.isPackage && (
                        <p className="mt-0.5 text-xs text-ink-tertiary">
                          {packageComponents(service)}
                        </p>
                      )}
                    </Td>
                    <Td>{formatDuration(service.durationMinutes)}</Td>
                    <Td className="font-medium text-ink">
                      {original > service.priceCents && (
                        <span className="mr-1.5 text-xs font-normal text-ink-tertiary line-through">
                          {formatBRL(original)}
                        </span>
                      )}
                      {formatBRL(service.priceCents)}
                    </Td>
                    <Td>
                      {service.active ? (
                        <Badge tone="success">Ativo</Badge>
                      ) : (
                        <Badge tone="neutral">Inativo</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(service)}
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate(service)}
                          isLoading={
                            toggleMutation.isPending && toggleMutation.variables?.id === service.id
                          }
                          leftIcon={<Power className="h-3.5 w-3.5" />}
                        >
                          <span className="w-[4.5rem] text-left">
                            {service.active ? 'Desativar' : 'Ativar'}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(service)}
                          className="text-error-dark hover:bg-error-light hover:text-error-dark"
                          leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                        >
                          Excluir
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar serviço' : 'Novo serviço'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Tipo: serviço simples ou pacote */}
          <div className="inline-flex w-full rounded-lg border border-line p-0.5">
            {(
              [
                { key: false, label: 'Serviço', icon: Scissors },
                { key: true, label: 'Pacote', icon: Package },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={() => setIsPackage(key)}
                className={cn(
                  'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
                  isPackage === key ? 'bg-primary text-white' : 'text-ink-secondary hover:text-ink',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <Input
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isPackage ? 'Ex.: Combo Corte + Barba' : 'Ex.: Corte masculino'}
            error={formErrors.name}
          />

          {isPackage ? (
            <>
              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                  Serviços incluídos
                </span>
                {selectableServices.length === 0 ? (
                  <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
                    Cadastre serviços simples primeiro para montar um pacote.
                  </p>
                ) : (
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-2">
                    {selectableServices.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background"
                      >
                        <input
                          type="checkbox"
                          checked={packageIds.includes(s.id)}
                          onChange={() => togglePackageId(s.id)}
                          className="h-4 w-4 rounded border-line accent-primary"
                        />
                        <span className="flex-1 truncate text-sm text-ink">{s.name}</span>
                        <span className="shrink-0 text-xs text-ink-tertiary">
                          {formatBRL(s.priceCents)} · {formatDuration(s.durationMinutes)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                {formErrors.pkg && <p className="mt-1.5 text-xs text-error-dark">{formErrors.pkg}</p>}
              </div>

              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                  Duração do pacote
                </span>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    value={displayDuration}
                    onChange={(e) => setPackageDuration(onlyDigits(e.target.value).slice(0, 4))}
                    className={cn(
                      'h-10 w-full rounded-lg border bg-surface pl-3 pr-14 text-sm text-ink placeholder:text-ink-tertiary',
                      'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                      formErrors.duration
                        ? 'border-error focus:border-error focus:ring-error-light'
                        : 'border-line focus:border-secondary focus:ring-secondary-light',
                    )}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                    min
                  </span>
                </div>
                {formErrors.duration ? (
                  <p className="mt-1.5 text-xs text-error-dark">{formErrors.duration}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-ink-tertiary">
                    Soma dos serviços: {formatDuration(sumDuration)}.
                    {packageDuration !== '' && Number(packageDuration) !== sumDuration && (
                      <button
                        type="button"
                        onClick={() => setPackageDuration('')}
                        className="ml-1 font-medium text-primary hover:underline"
                      >
                        Usar a soma
                      </button>
                    )}
                  </p>
                )}
              </div>

              <div>
                <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                  Desconto
                </span>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 rounded-lg border border-line p-0.5">
                    {(['percent', 'fixed'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setDiscountType(type)
                          setDiscountValue('')
                        }}
                        className={cn(
                          'h-9 rounded-md px-3 text-[13px] font-medium transition-colors',
                          discountType === type
                            ? 'bg-primary text-white'
                            : 'text-ink-secondary hover:text-ink',
                        )}
                      >
                        {type === 'percent' ? '%' : 'R$'}
                      </button>
                    ))}
                  </div>
                  <div className="relative flex-1">
                    {discountType === 'fixed' && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                        R$
                      </span>
                    )}
                    <input
                      inputMode={discountType === 'percent' ? 'numeric' : 'decimal'}
                      value={discountValue}
                      onChange={(e) => {
                        const v = e.target.value
                        if (discountType === 'percent') {
                          const digits = onlyDigits(v).slice(0, 3)
                          setDiscountValue(digits === '' ? '' : String(Math.min(Number(digits), 100)))
                        } else {
                          setDiscountValue(v.replace(/[^\d,]/g, ''))
                        }
                      }}
                      placeholder={discountType === 'percent' ? '0' : '0,00'}
                      className={cn(
                        'h-10 w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-tertiary',
                        'transition-shadow duration-150 focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light',
                        discountType === 'fixed' ? 'pl-9 pr-3' : 'pl-3 pr-8',
                      )}
                    />
                    {discountType === 'percent' && (
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                        %
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Prévia */}
              <div className="space-y-1.5 rounded-lg bg-background p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Soma dos serviços</span>
                  <span className="text-ink">{formatBRL(sumCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Duração</span>
                  <span className="text-ink">{formatDuration(Number(displayDuration) || 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-secondary">Desconto</span>
                  <span className="font-medium text-ink">
                    {discountType === 'percent'
                      ? `${discountPct}% (− ${formatBRL(discountCents)})`
                      : `${formatBRL(discountCents)} (${discountPct}%)`}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line-divider pt-1.5">
                  <span className="font-medium text-ink">Preço do pacote</span>
                  <span className="font-display text-base font-bold text-primary">
                    {formatBRL(packageFinalCents)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <Select label="Duração" value={duration} onChange={(e) => setDuration(e.target.value)}>
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {formatDuration(minutes)}
                  </option>
                ))}
              </Select>
              <Input
                label="Preço"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="45,00"
                error={formErrors.price}
                leftIcon={<span className="text-sm">R$</span>}
              />
            </>
          )}

          <DialogActions className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editing ? 'Salvar' : isPackage ? 'Criar pacote' : 'Criar serviço'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
        title="Excluir serviço?"
        description={
          deleteTarget
            ? `O serviço "${deleteTarget.name}" será removido permanentemente. Se ele possui agendamentos, prefira desativá-lo.`
            : undefined
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
