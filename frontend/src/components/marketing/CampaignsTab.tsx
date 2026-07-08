import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Megaphone,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ApiError } from '../../api/client'
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '../../api/coupons'
import type { CouponPayload } from '../../api/coupons'
import { listServices } from '../../api/services'
import { describeCouponDiscount, describeCouponValidity } from '../../lib/coupons'
import { cn, formatBRL, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { Coupon, CouponDiscountType } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { SkeletonList } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const DISCOUNT_TYPE_OPTIONS: { key: CouponDiscountType; label: string }[] = [
  { key: 'percent', label: '%' },
  { key: 'fixed', label: 'R$' },
  { key: 'free_service', label: 'Grátis' },
]

export function CampaignsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['coupons', 'campaign'], queryFn: () => listCoupons('campaign') })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [firstVisitOnly, setFirstVisitOnly] = useState(false)
  const [minSpend, setMinSpend] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [servicesOpen, setServicesOpen] = useState(false)
  const [formErrors, setFormErrors] = useState<{ name?: string; value?: string; dates?: string }>({})
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null)

  const campaigns = query.data ?? []
  const services = servicesQuery.data ?? []

  function resetForm() {
    setName('')
    setDiscountType('percent')
    setDiscountValue('')
    setFirstVisitOnly(false)
    setMinSpend('')
    setMaxDiscount('')
    setValidFrom('')
    setValidUntil('')
    setServiceIds([])
    setServicesOpen(false)
    setFormErrors({})
  }

  function openCreate(suggestFirstVisit = false) {
    setEditing(null)
    resetForm()
    if (suggestFirstVisit) {
      setName('Primeira visita com desconto')
      setFirstVisitOnly(true)
    }
    setDialogOpen(true)
  }

  function openEdit(campaign: Coupon) {
    setEditing(campaign)
    setName(campaign.name ?? '')
    setDiscountType(campaign.discountType)
    setDiscountValue(
      campaign.discountType === 'percent'
        ? String(campaign.discountValue)
        : campaign.discountType === 'fixed'
          ? (campaign.discountValue / 100).toFixed(2).replace('.', ',')
          : '',
    )
    setFirstVisitOnly(campaign.firstVisitOnly)
    setMinSpend(
      campaign.minSpendCents > 0
        ? (campaign.minSpendCents / 100).toFixed(2).replace('.', ',')
        : '',
    )
    setMaxDiscount(
      campaign.maxDiscountCents != null
        ? (campaign.maxDiscountCents / 100).toFixed(2).replace('.', ',')
        : '',
    )
    setValidFrom(campaign.validFrom ?? '')
    setValidUntil(campaign.validUntil ?? '')
    const ids = campaign.appliesToServiceIds ?? []
    setServiceIds(ids)
    setServicesOpen(ids.length > 0)
    setFormErrors({})
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: (data: CouponPayload) => createCoupon(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Campanha criada!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CouponPayload> }) =>
      updateCoupon(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Campanha atualizada!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const toggleMutation = useMutation({
    mutationFn: (campaign: Coupon) => updateCoupon(campaign.id, { active: !campaign.active }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success(updated.active ? 'Campanha ativada!' : 'Campanha desativada.')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Campanha excluída.')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
      setDeleteTarget(null)
    },
  })

  function toggleServiceId(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function conditionsLabel(campaign: Coupon): string {
    const parts: string[] = []
    if (campaign.firstVisitOnly) parts.push('Primeira visita')
    if (campaign.minSpendCents > 0) parts.push(`mín. ${formatBRL(campaign.minSpendCents)}`)
    return parts.join(' · ')
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const nextErrors: typeof formErrors = {}
    if (!name.trim()) nextErrors.name = 'Informe o nome da campanha'
    if (discountType === 'percent') {
      const pct = Math.min(Number(onlyDigits(discountValue)) || 0, 100)
      if (pct <= 0) nextErrors.value = 'Informe uma porcentagem entre 1 e 100'
    } else if (discountType === 'fixed') {
      if (parseBRLToCents(discountValue) <= 0) nextErrors.value = 'Informe um valor válido'
    }
    if (validFrom && validUntil && validFrom > validUntil) {
      nextErrors.dates = 'A data inicial deve ser anterior à final'
    }
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: CouponPayload = {
      name: name.trim(),
      discountType,
      firstVisitOnly,
      minSpendCents: minSpend.trim() === '' ? 0 : parseBRLToCents(minSpend),
      maxDiscountCents:
        discountType === 'fixed' || maxDiscount.trim() === '' ? null : parseBRLToCents(maxDiscount),
      validFrom: validFrom === '' ? null : validFrom,
      validUntil: validUntil === '' ? null : validUntil,
      appliesToServiceIds: serviceIds,
    }
    if (discountType !== 'free_service') {
      payload.discountValue =
        discountType === 'percent'
          ? Math.min(Number(onlyDigits(discountValue)) || 0, 100)
          : parseBRLToCents(discountValue)
    }

    if (editing) updateMutation.mutate({ id: editing.id, data: payload })
    else createMutation.mutate({ ...payload, source: 'campaign' })
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-ink-secondary">
          Campanhas aplicam o desconto sozinhas no fechamento do atendimento quando as condições
          casam (ex.: primeira visita). Se mais de uma casar, vale a de maior desconto (cupom
          digitado ou desconto manual têm prioridade).
        </p>
        <Button onClick={() => openCreate()} leftIcon={<Plus className="h-4 w-4" />}>
          Nova campanha
        </Button>
      </div>

      {query.isPending && <SkeletonList rows={4} />}

      {query.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar as campanhas.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!query.isPending && !query.isError && campaigns.length === 0 && (
        <EmptyState
          icon={Megaphone}
          title="Nenhuma campanha automática"
          description="Comece pela clássica: desconto no primeiro atendimento para conquistar clientes novos."
          action={
            <Button onClick={() => openCreate(true)} leftIcon={<Sparkles className="h-4 w-4" />}>
              Criar campanha de primeira visita
            </Button>
          }
        />
      )}

      {!query.isPending && !query.isError && campaigns.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Campanha</Th>
                <Th>Desconto</Th>
                <Th>Validade</Th>
                <Th>Usos</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {campaigns.map((campaign) => {
                const conditions = conditionsLabel(campaign)
                return (
                  <Tr key={campaign.id}>
                    <Td>
                      <span className="font-medium text-ink">{campaign.name ?? 'Campanha'}</span>
                      {conditions && (
                        <p className="mt-0.5 text-xs text-ink-tertiary">{conditions}</p>
                      )}
                    </Td>
                    <Td className="font-medium text-ink">
                      {describeCouponDiscount(campaign.discountType, campaign.discountValue)}
                    </Td>
                    <Td>{describeCouponValidity(campaign.validFrom, campaign.validUntil)}</Td>
                    <Td>{campaign.redemptionsCount}</Td>
                    <Td>
                      {campaign.active ? (
                        <Badge tone="success">Ativa</Badge>
                      ) : (
                        <Badge tone="neutral">Inativa</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(campaign)}
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleMutation.mutate(campaign)}
                          isLoading={
                            toggleMutation.isPending &&
                            toggleMutation.variables?.id === campaign.id
                          }
                          leftIcon={<Power className="h-3.5 w-3.5" />}
                        >
                          <span className="w-[4.5rem] text-left">
                            {campaign.active ? 'Desativar' : 'Ativar'}
                          </span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(campaign)}
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
        title={editing ? 'Editar campanha' : 'Nova campanha'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Nome da campanha"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Primeira visita com desconto"
            error={formErrors.name}
          />

          <div>
            <span className="mb-2 block text-[13px] font-medium text-ink-secondary">Desconto</span>
            <div className="flex gap-2">
              <div className="inline-flex shrink-0 rounded-lg border border-line p-0.5">
                {DISCOUNT_TYPE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDiscountType(key)
                      setDiscountValue('')
                    }}
                    className={cn(
                      'h-9 rounded-md px-3 text-[13px] font-medium transition-colors',
                      discountType === key
                        ? 'bg-primary text-white'
                        : 'text-ink-secondary hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {discountType === 'free_service' ? (
                <p className="flex flex-1 items-center rounded-lg bg-background px-3 text-xs text-ink-tertiary">
                  O serviço sai de graça para o cliente.
                </p>
              ) : (
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
                      'h-10 w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-ink-tertiary',
                      'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                      formErrors.value
                        ? 'border-error focus:border-error focus:ring-error-light'
                        : 'border-line focus:border-secondary focus:ring-secondary-light',
                      discountType === 'fixed' ? 'pl-9 pr-3' : 'pl-3 pr-8',
                    )}
                  />
                  {discountType === 'percent' && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                      %
                    </span>
                  )}
                </div>
              )}
            </div>
            {formErrors.value && <p className="mt-1.5 text-xs text-error-dark">{formErrors.value}</p>}
          </div>

          {/* Condição em destaque: primeira visita */}
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">Somente na primeira visita do cliente</p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                Aplica o desconto apenas no primeiro atendimento de clientes novos.
              </p>
            </div>
            <Switch
              checked={firstVisitOnly}
              onChange={setFirstVisitOnly}
              aria-label="Somente na primeira visita do cliente"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Pedido mínimo (opcional)"
              inputMode="decimal"
              value={minSpend}
              onChange={(e) => setMinSpend(e.target.value.replace(/[^\d,]/g, ''))}
              placeholder="0,00"
              leftIcon={<span className="text-sm">R$</span>}
            />
            {discountType !== 'fixed' && (
              <Input
                label="Desconto máximo (opcional)"
                inputMode="decimal"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value.replace(/[^\d,]/g, ''))}
                placeholder="0,00"
                leftIcon={<span className="text-sm">R$</span>}
              />
            )}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Válida de (opcional)"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
              <Input
                label="Válida até (opcional)"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            {formErrors.dates && <p className="mt-1.5 text-xs text-error-dark">{formErrors.dates}</p>}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setServicesOpen((prev) => !prev)}
              className="flex w-full items-center gap-1.5 text-[13px] font-medium text-ink-secondary hover:text-ink"
            >
              {servicesOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Serviços permitidos
              <span className="font-normal text-ink-tertiary">
                {serviceIds.length === 0 ? '(todos)' : `(${serviceIds.length} selecionados)`}
              </span>
            </button>
            {servicesOpen && (
              <div className="mt-2">
                {servicesQuery.isPending ? (
                  <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
                    Carregando serviços…
                  </p>
                ) : services.length === 0 ? (
                  <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
                    Nenhum serviço cadastrado. Sem seleção, a campanha vale para todos.
                  </p>
                ) : (
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-2">
                    {services.map((s) => (
                      <label
                        key={s.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background"
                      >
                        <input
                          type="checkbox"
                          checked={serviceIds.includes(s.id)}
                          onChange={() => toggleServiceId(s.id)}
                          className="h-4 w-4 rounded border-line accent-primary"
                        />
                        <span className="flex-1 truncate text-sm text-ink">{s.name}</span>
                        <span className="shrink-0 text-xs text-ink-tertiary">
                          {formatBRL(s.priceCents)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-ink-tertiary">
                  Sem seleção, a campanha vale para qualquer serviço.
                </p>
              </div>
            )}
          </div>

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
              {editing ? 'Salvar' : 'Criar campanha'}
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
        title="Excluir campanha?"
        description={
          deleteTarget
            ? `A campanha "${deleteTarget.name ?? 'sem nome'}" será removida. Se ela já foi usada em atendimentos, prefira desativá-la para preservar o histórico.`
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
