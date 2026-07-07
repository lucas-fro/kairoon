import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Pencil, Percent, Plus, Power, Ticket, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from '../../api/coupons'
import type { CouponPayload } from '../../api/coupons'
import { listServices } from '../../api/services'
import { describeCouponDiscount, describeCouponValidity } from '../../lib/coupons'
import { cn, formatBRL, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { Coupon, CouponAppliesTo, CouponDiscountType } from '../../types/api'
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
import { Switch } from '../ui/Switch'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const CODE_PATTERN = /^[A-Z0-9-]{3,30}$/

const DISCOUNT_TYPE_OPTIONS: { key: CouponDiscountType; label: string }[] = [
  { key: 'percent', label: '%' },
  { key: 'fixed', label: 'R$' },
  { key: 'free_service', label: 'Grátis' },
]

export function CouponsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['coupons', 'manual'], queryFn: () => listCoupons('manual') })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [appliesTo, setAppliesTo] = useState<CouponAppliesTo>('total')
  const [restrictServices, setRestrictServices] = useState(false)
  const [serviceIds, setServiceIds] = useState<string[]>([])
  const [minSpend, setMinSpend] = useState('')
  const [maxDiscount, setMaxDiscount] = useState('')
  const [validFrom, setValidFrom] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [usesPerClient, setUsesPerClient] = useState('1')
  const [firstVisitOnly, setFirstVisitOnly] = useState(false)
  const [formErrors, setFormErrors] = useState<{ code?: string; value?: string; dates?: string }>(
    {},
  )
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null)

  const coupons = query.data ?? []
  const activeServices = (servicesQuery.data ?? []).filter((s) => s.active)

  function resetForm() {
    setCode('')
    setName('')
    setDiscountType('percent')
    setDiscountValue('')
    setAppliesTo('total')
    setRestrictServices(false)
    setServiceIds([])
    setMinSpend('')
    setMaxDiscount('')
    setValidFrom('')
    setValidUntil('')
    setMaxUses('')
    setUsesPerClient('1')
    setFirstVisitOnly(false)
    setFormErrors({})
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(coupon: Coupon) {
    setEditing(coupon)
    setCode(coupon.code ?? '')
    setName(coupon.name ?? '')
    setDiscountType(coupon.discountType)
    if (coupon.discountType === 'percent') setDiscountValue(String(coupon.discountValue))
    else if (coupon.discountType === 'fixed') {
      setDiscountValue((coupon.discountValue / 100).toFixed(2).replace('.', ','))
    } else setDiscountValue('')
    setAppliesTo(coupon.appliesTo)
    const ids = coupon.appliesToServiceIds ?? []
    setRestrictServices(ids.length > 0)
    setServiceIds(ids)
    setMinSpend(
      coupon.minSpendCents > 0 ? (coupon.minSpendCents / 100).toFixed(2).replace('.', ',') : '',
    )
    setMaxDiscount(
      coupon.maxDiscountCents != null
        ? (coupon.maxDiscountCents / 100).toFixed(2).replace('.', ',')
        : '',
    )
    setValidFrom(coupon.validFrom ? coupon.validFrom.slice(0, 10) : '')
    setValidUntil(coupon.validUntil ? coupon.validUntil.slice(0, 10) : '')
    setMaxUses(coupon.maxUses != null ? String(coupon.maxUses) : '')
    setUsesPerClient(String(coupon.usesPerClient || 1))
    setFirstVisitOnly(coupon.firstVisitOnly)
    setFormErrors({})
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: createCoupon,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Cupom criado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CouponPayload }) => updateCoupon(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Cupom atualizado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const toggleMutation = useMutation({
    mutationFn: (coupon: Coupon) => updateCoupon(coupon.id, { active: !coupon.active }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success(updated.active ? 'Cupom ativado!' : 'Cupom desativado.')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCoupon(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast.success('Cupom excluído.')
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

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const nextErrors: typeof formErrors = {}
    const trimmedCode = code.trim()
    if (!CODE_PATTERN.test(trimmedCode)) {
      nextErrors.code = 'Use de 3 a 30 caracteres: letras, números e hífen'
    }

    let discountValueNumber: number | undefined
    if (discountType === 'percent') {
      const pct = Math.min(Number(onlyDigits(discountValue)) || 0, 100)
      if (pct < 1) nextErrors.value = 'Informe um percentual entre 1 e 100'
      discountValueNumber = pct
    } else if (discountType === 'fixed') {
      const cents = parseBRLToCents(discountValue)
      if (cents <= 0) nextErrors.value = 'Informe um valor válido'
      discountValueNumber = cents
    }

    if (validFrom && validUntil && validFrom > validUntil) {
      nextErrors.dates = 'A data final deve ser igual ou posterior à inicial'
    }

    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: CouponPayload = {
      code: trimmedCode,
      name: name.trim() || undefined,
      discountType,
      ...(discountValueNumber !== undefined ? { discountValue: discountValueNumber } : {}),
      ...(discountType !== 'free_service' ? { appliesTo } : {}),
      appliesToServiceIds: restrictServices ? serviceIds : [],
      minSpendCents: parseBRLToCents(minSpend),
      maxDiscountCents:
        discountType !== 'fixed' && maxDiscount.trim() !== '' ? parseBRLToCents(maxDiscount) : null,
      validFrom: validFrom || null,
      validUntil: validUntil || null,
      maxUses: maxUses.trim() === '' ? null : Math.max(1, Number(maxUses)),
      usesPerClient: Math.max(1, Number(onlyDigits(usesPerClient)) || 1),
      firstVisitOnly,
    }

    if (editing) updateMutation.mutate({ id: editing.id, data: payload })
    else createMutation.mutate({ ...payload, source: 'manual' })
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-secondary">
          Cupons com código que você divulga e o cliente usa ao agendar ou pagar.
        </p>
        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
          Novo cupom
        </Button>
      </div>

      {query.isPending && <SkeletonList rows={4} />}

      {query.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar os cupons.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!query.isPending && !query.isError && coupons.length === 0 && (
        <EmptyState
          icon={Ticket}
          title="Nenhum cupom criado"
          description="Crie um código de desconto para divulgar aos seus clientes."
          action={
            <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
              Novo cupom
            </Button>
          }
        />
      )}

      {!query.isPending && !query.isError && coupons.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Código</Th>
                <Th>Desconto</Th>
                <Th>Validade</Th>
                <Th>Usos</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {coupons.map((coupon) => (
                <Tr key={coupon.id}>
                  <Td>
                    <span className="font-mono text-sm font-medium text-ink">
                      {coupon.code ?? '—'}
                    </span>
                    {coupon.name && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">{coupon.name}</p>
                    )}
                  </Td>
                  <Td className="font-medium text-ink">
                    {describeCouponDiscount(coupon.discountType, coupon.discountValue)}
                    {coupon.appliesTo === 'service' && coupon.discountType !== 'free_service'
                      ? ' no serviço'
                      : ''}
                  </Td>
                  <Td>{describeCouponValidity(coupon.validFrom, coupon.validUntil)}</Td>
                  <Td>{`${coupon.redemptionsCount}${coupon.maxUses ? `/${coupon.maxUses}` : ''}`}</Td>
                  <Td>
                    {coupon.active ? (
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
                        onClick={() => openEdit(coupon)}
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate(coupon)}
                        isLoading={
                          toggleMutation.isPending && toggleMutation.variables?.id === coupon.id
                        }
                        leftIcon={<Power className="h-3.5 w-3.5" />}
                      >
                        <span className="w-[4.5rem] text-left">
                          {coupon.active ? 'Desativar' : 'Ativar'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(coupon)}
                        className="text-error-dark hover:bg-error-light hover:text-error-dark"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Excluir
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar cupom' : 'Novo cupom'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Código"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9-]/g, '')
                  .slice(0, 30),
              )
            }
            placeholder="Ex.: BEMVINDA10"
            error={formErrors.code}
            className="font-mono uppercase"
          />

          <Input
            label="Nome/descrição (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Boas-vindas para novas clientes"
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
              {discountType !== 'free_service' ? (
                <div className="flex-1">
                  <Input
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
                    placeholder={discountType === 'percent' ? '10' : '20,00'}
                    error={formErrors.value}
                    leftIcon={
                      discountType === 'percent' ? (
                        <Percent className="h-4 w-4" />
                      ) : (
                        <span className="text-sm">R$</span>
                      )
                    }
                  />
                </div>
              ) : (
                <p className="flex flex-1 items-center rounded-lg bg-background px-3 text-xs text-ink-tertiary">
                  O serviço do atendimento sai de graça.
                </p>
              )}
            </div>
          </div>

          {discountType !== 'free_service' && (
            <Select
              label="Aplica em"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as CouponAppliesTo)}
            >
              <option value="total">Total do atendimento</option>
              <option value="service">Só o serviço</option>
            </Select>
          )}

          <div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-ink-secondary">
                Restringir a serviços específicos
              </span>
              <Switch
                checked={restrictServices}
                onChange={setRestrictServices}
                aria-label="Restringir a serviços específicos"
              />
            </div>
            {restrictServices && (
              <div className="mt-2">
                {activeServices.length === 0 ? (
                  <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
                    Nenhum serviço ativo encontrado.
                  </p>
                ) : (
                  <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-2">
                    {activeServices.map((s) => (
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
                  Nenhum selecionado = vale para qualquer serviço.
                </p>
              </div>
            )}
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
            {discountType !== 'fixed' ? (
              <Input
                label="Desconto máximo (opcional)"
                inputMode="decimal"
                value={maxDiscount}
                onChange={(e) => setMaxDiscount(e.target.value.replace(/[^\d,]/g, ''))}
                placeholder="Sem limite"
                leftIcon={<span className="text-sm">R$</span>}
              />
            ) : (
              <div aria-hidden />
            )}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Válido de (opcional)"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
              <Input
                label="Válido até (opcional)"
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
            {formErrors.dates && (
              <p className="mt-1.5 text-xs text-error-dark">{formErrors.dates}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Limite total de usos"
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(onlyDigits(e.target.value).slice(0, 5))}
              placeholder="Ilimitado"
            />
            <Input
              label="Usos por cliente"
              inputMode="numeric"
              value={usesPerClient}
              onChange={(e) => setUsesPerClient(onlyDigits(e.target.value).slice(0, 3))}
              placeholder="1"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-ink-secondary">
              Somente na primeira visita do cliente
            </span>
            <Switch
              checked={firstVisitOnly}
              onChange={setFirstVisitOnly}
              aria-label="Somente na primeira visita do cliente"
            />
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
              {editing ? 'Salvar' : 'Criar cupom'}
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
        title="Excluir cupom?"
        description={
          deleteTarget
            ? `O cupom "${deleteTarget.code ?? deleteTarget.name ?? ''}" será removido. Cupons que já possuem resgates não são apagados: eles são apenas desativados, para preservar o histórico.`
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
