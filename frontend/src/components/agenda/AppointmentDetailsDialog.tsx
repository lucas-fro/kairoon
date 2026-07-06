import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarClock,
  ChevronRight,
  Clock,
  CreditCard,
  Globe,
  Minus,
  Phone,
  Plus,
  QrCode,
  Scissors,
  Search,
  ShoppingBag,
  Store,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { updateAppointment } from '../../api/appointments'
import type { UpdateAppointmentPayload } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { listProducts } from '../../api/products'
import { useAuth } from '../../contexts/AuthContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { cn, formatBRL, formatDate, formatPhone, parseBRLToCents } from '../../lib/format'
import type { Appointment, Payment, PaymentMethod, PaymentSettings, Product } from '../../types/api'
import { buildTimeOptions } from './timeOptions'

const statusBadge: Record<
  Appointment['status'],
  { label: string; tone: 'success' | 'brand' | 'error' | 'warning' }
> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  completed: { label: 'Concluído', tone: 'brand' },
  pending: { label: 'Pendente', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'error' },
}

const METHOD_META: Record<PaymentMethod, { label: string; icon: LucideIcon }> = {
  cash: { label: 'Dinheiro', icon: Banknote },
  pix: { label: 'PIX', icon: QrCode },
  debit: { label: 'Débito', icon: CreditCard },
  credit: { label: 'Crédito', icon: CreditCard },
}

const FALLBACK_PAYMENT_SETTINGS: PaymentSettings = {
  cash: true,
  pix: true,
  debit: true,
  credit: { enabled: false, brands: [] },
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

function paymentLabel(payment: Payment): string {
  const base = METHOD_META[payment.method].label
  if (payment.method !== 'credit') return base
  const parts = [base]
  if (payment.installments) parts.push(`${payment.installments}x`)
  if (payment.brand) parts.push(payment.brand)
  return parts.join(' · ')
}

interface AppointmentDetailsDialogProps {
  appointment: Appointment | null
  onClose: () => void
  startMinutes: number
  endMinutes: number
}

export function AppointmentDetailsDialog({
  appointment,
  onClose,
  startMinutes,
  endMinutes,
}: AppointmentDetailsDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { establishment } = useAuth()

  const [rescheduling, setRescheduling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const [pickingProducts, setPickingProducts] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  const timeOptions = useMemo(
    () => buildTimeOptions(startMinutes, endMinutes),
    [startMinutes, endMinutes],
  )

  useEffect(() => {
    if (!appointment) return
    setRescheduling(false)
    setConfirmCancel(false)
    setFinalizing(false)
    setPickingProducts(false)
    setNewDate(appointment.date)
    setNewTime(appointment.startTime)
  }, [appointment])

  const mutation = useMutation({
    mutationFn: (data: UpdateAppointmentPayload) => updateAppointment(appointment!.id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['commissions'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      const message =
        variables.status === 'completed'
          ? 'Atendimento finalizado — entrada lançada no financeiro'
          : variables.status === 'cancelled'
            ? 'Agendamento cancelado'
            : variables.date
              ? 'Agendamento remarcado'
              : 'Agendamento atualizado'
      toast.success(message)
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao atualizar')
    },
  })

  if (!appointment) return null

  const badge = statusBadge[appointment.status]
  const paymentSettings = establishment?.paymentSettings ?? FALLBACK_PAYMENT_SETTINGS

  return (
    <>
      <Dialog
        open={!confirmCancel}
        onClose={onClose}
        title={
          pickingProducts
            ? 'Selecionar produtos'
            : finalizing
              ? 'Fechamento do serviço'
              : 'Detalhes do agendamento'
        }
        maxWidth={finalizing ? 'max-w-3xl' : 'max-w-md'}
      >
        {finalizing ? (
          <PaymentCheckout
            appointment={appointment}
            paymentSettings={paymentSettings}
            isLoading={mutation.isPending}
            onPickingChange={setPickingProducts}
            onBack={() => setFinalizing(false)}
            onConfirm={(payments, discountCents, saleProducts) =>
              mutation.mutate({ status: 'completed', discountCents, payments, saleProducts })
            }
          />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={badge.tone}>{badge.label}</Badge>
              {appointment.createdVia === 'public' ? (
                <Badge tone="info">
                  <Globe className="h-3 w-3" /> via link público
                </Badge>
              ) : (
                <Badge tone="neutral">
                  <Store className="h-3 w-3" /> Balcão
                </Badge>
              )}
            </div>

            <div className="space-y-3 rounded-xl bg-background p-4 text-sm">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <div>
                  <p className="font-medium text-ink">{appointment.client.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-tertiary">
                    <Phone className="h-3 w-3" /> {formatPhone(appointment.client.phone)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Scissors className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <p className="text-ink-secondary">
                  {appointment.service.name}{' '}
                  <span className="font-semibold text-primary">
                    {formatBRL(appointment.service.priceCents)}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                <CalendarClock className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <p className="text-ink-secondary">
                  {formatDate(appointment.date)} · {appointment.startTime} – {appointment.endTime}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <p className="text-ink-secondary">Profissional: {appointment.employee.name}</p>
              </div>
            </div>

            {appointment.status === 'completed' &&
              appointment.saleProducts &&
              appointment.saleProducts.length > 0 && (
                <div className="space-y-2 rounded-xl bg-background p-4 text-sm">
                  <p className="text-[13px] font-medium text-ink-secondary">Produtos</p>
                  {appointment.saleProducts.map((product, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-ink-secondary">
                        {product.quantity}× {product.name}
                      </span>
                      <span className="font-medium text-ink">
                        {formatBRL(product.quantity * product.unitPriceCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            {appointment.status === 'completed' &&
              appointment.payments &&
              appointment.payments.length > 0 && (
                <div className="space-y-2 rounded-xl bg-background p-4 text-sm">
                  <p className="text-[13px] font-medium text-ink-secondary">Pagamento</p>
                  {appointment.payments.map((payment, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-ink-secondary">{paymentLabel(payment)}</span>
                      <span className="font-medium text-ink">{formatBRL(payment.amountCents)}</span>
                    </div>
                  ))}
                </div>
              )}

            {rescheduling && (
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-secondary-light/60 p-4">
                <Input
                  label="Nova data"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                />
                <Select
                  label="Novo horário"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                >
                  {timeOptions.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="pt-1">
              {appointment.status === 'pending' && !rescheduling && (
                <DialogActions>
                  <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                    Recusar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRescheduling(true)}>
                    Remarcar
                  </Button>
                  <Button
                    size="sm"
                    isLoading={mutation.isPending}
                    onClick={() => mutation.mutate({ status: 'confirmed' })}
                  >
                    Aceitar
                  </Button>
                </DialogActions>
              )}
              {appointment.status === 'confirmed' && !rescheduling && (
                <DialogActions>
                  <Button variant="danger" size="sm" onClick={() => setConfirmCancel(true)}>
                    Cancelar
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setRescheduling(true)}>
                    Remarcar
                  </Button>
                  <Button size="sm" onClick={() => setFinalizing(true)}>
                    Finalizar
                  </Button>
                </DialogActions>
              )}
              {(appointment.status === 'confirmed' || appointment.status === 'pending') &&
                rescheduling && (
                  <DialogActions>
                    <Button variant="outline" size="sm" onClick={() => setRescheduling(false)}>
                      Voltar
                    </Button>
                    <Button
                      size="sm"
                      isLoading={mutation.isPending}
                      disabled={!newDate || !newTime}
                      onClick={() => mutation.mutate({ date: newDate, startTime: newTime })}
                    >
                      Confirmar remarcação
                    </Button>
                  </DialogActions>
                )}
              {appointment.status === 'completed' && (
                <DialogActions>
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={mutation.isPending}
                    onClick={() => mutation.mutate({ status: 'confirmed' })}
                  >
                    Reabrir atendimento
                  </Button>
                </DialogActions>
              )}
              {appointment.status === 'cancelled' && (
                <DialogActions>
                  <Button
                    variant="outline"
                    size="sm"
                    isLoading={mutation.isPending}
                    onClick={() => mutation.mutate({ status: 'confirmed' })}
                  >
                    Restaurar agendamento
                  </Button>
                </DialogActions>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => mutation.mutate({ status: 'cancelled' })}
        title="Cancelar agendamento?"
        description={`O horário de ${appointment.startTime} em ${formatDate(appointment.date)} será liberado para outros clientes.`}
        confirmLabel="Cancelar agendamento"
        cancelLabel="Voltar"
        danger
        isLoading={mutation.isPending}
      />
    </>
  )
}

interface PaymentCheckoutProps {
  appointment: Appointment
  paymentSettings: PaymentSettings
  isLoading: boolean
  onPickingChange: (picking: boolean) => void
  onBack: () => void
  onConfirm: (
    payments: {
      method: PaymentMethod
      brand: string | null
      installments: number | null
      amountCents: number
    }[],
    discountCents: number,
    saleProducts: { productId: string; quantity: number }[],
  ) => void
}

function PaymentCheckout({
  appointment,
  paymentSettings,
  isLoading,
  onPickingChange,
  onBack,
  onConfirm,
}: PaymentCheckoutProps) {
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const catalog = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.active),
    [productsQuery.data],
  )
  const catalogById = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog])

  const [saleItems, setSaleItems] = useState<{ productId: string; quantity: number }[]>([])
  const [picking, setPicking] = useState(false)

  function openPicker() {
    setPicking(true)
    onPickingChange(true)
  }

  function closePicker() {
    setPicking(false)
    onPickingChange(false)
  }

  function applyPicked(items: { productId: string; quantity: number }[]) {
    setSaleItems(items)
    closePicker()
  }

  const servicesCents = appointment.service.priceCents
  const productsCents = saleItems.reduce(
    (sum, item) => sum + (catalogById.get(item.productId)?.priceCents ?? 0) * item.quantity,
    0,
  )
  // Desconto será tratado depois; por ora o total final é serviço + produtos.
  const discountCents = 0
  const subtotalCents = servicesCents + productsCents
  const finalCents = Math.max(0, subtotalCents - discountCents)

  const available = useMemo(() => {
    const list: PaymentMethod[] = []
    if (paymentSettings.cash) list.push('cash')
    if (paymentSettings.pix) list.push('pix')
    if (paymentSettings.debit) list.push('debit')
    if (paymentSettings.credit.enabled) list.push('credit')
    return list
  }, [paymentSettings])

  const brands = paymentSettings.credit.brands
  const [selected, setSelected] = useState<PaymentMethod[]>([])
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [creditBrand, setCreditBrand] = useState(brands[0]?.name ?? '')
  const [creditInstallments, setCreditInstallments] = useState(1)

  // Com uma única forma de pagamento, mantém o valor sincronizado ao total
  // (que muda quando produtos entram/saem).
  useEffect(() => {
    if (selected.length === 1) {
      setAmounts({ [selected[0]]: centsToInput(finalCents) })
    }
  }, [finalCents, selected])

  const maxInstallments = brands.find((b) => b.name === creditBrand)?.maxInstallments ?? 1
  const sumCents = selected.reduce((sum, method) => sum + parseBRLToCents(amounts[method] ?? ''), 0)
  const remainingCents = finalCents - sumCents

  function toggle(method: PaymentMethod) {
    if (selected.includes(method)) {
      setSelected(selected.filter((m) => m !== method))
      setAmounts((prev) => {
        const next = { ...prev }
        delete next[method]
        return next
      })
      return
    }
    const allocated = selected.reduce((sum, m) => sum + parseBRLToCents(amounts[m] ?? ''), 0)
    const left = Math.max(0, finalCents - allocated)
    setSelected([...selected, method])
    setAmounts((prev) => ({ ...prev, [method]: left > 0 ? centsToInput(left) : '' }))
  }

  function setAmount(method: PaymentMethod, raw: string) {
    setAmounts((prev) => ({ ...prev, [method]: raw.replace(/[^\d,]/g, '') }))
  }

  const creditMissingBrand = selected.includes('credit') && !creditBrand
  const canFinalize =
    selected.length > 0 && remainingCents === 0 && !creditMissingBrand && !isLoading

  function handleConfirm() {
    const payments = selected.map((method) => ({
      method,
      brand: method === 'credit' ? creditBrand || null : null,
      installments: method === 'credit' ? creditInstallments : null,
      amountCents: parseBRLToCents(amounts[method] ?? ''),
    }))
    onConfirm(payments, discountCents, saleItems)
  }

  if (picking) {
    return (
      <ProductPicker
        catalog={catalog}
        loading={productsQuery.isLoading}
        initial={saleItems}
        onCancel={closePicker}
        onSave={applyPicked}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        {/* Resumo */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-xl bg-background p-4 text-sm">
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <p className="font-medium text-ink">{appointment.client.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <Scissors className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <p className="text-ink-secondary">{appointment.service.name}</p>
            </div>
            <div className="flex items-center gap-3">
              <CalendarClock className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <p className="text-ink-secondary">
                {formatDate(appointment.date)} · {appointment.startTime}
              </p>
            </div>
          </div>

          {/* Botão que abre o seletor de produtos */}
          {catalog.length > 0 && (
            <button
              type="button"
              onClick={openPicker}
              className="flex w-full items-center gap-2 rounded-xl border border-line px-4 py-3 text-sm font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <ShoppingBag className="h-4 w-4 text-ink-tertiary" />
              <span>Produtos</span>
              {saleItems.length > 0 && (
                <span className="text-xs text-ink-tertiary">
                  · {saleItems.length} {saleItems.length === 1 ? 'item' : 'itens'}
                </span>
              )}
              <ChevronRight className="ml-auto h-4 w-4 text-ink-tertiary" />
            </button>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-ink-secondary">Serviço</span>
              <span className="text-ink">{formatBRL(servicesCents)}</span>
            </div>
            {saleItems.map((item) => {
              const product = catalogById.get(item.productId)
              if (!product) return null
              return (
                <div key={item.productId} className="flex items-center justify-between">
                  <span className="text-ink-secondary">
                    {item.quantity}× {product.name}
                  </span>
                  <span className="text-ink">
                    {formatBRL(product.priceCents * item.quantity)}
                  </span>
                </div>
              )
            })}
            <div className="flex items-center justify-between">
              <span className="text-ink-secondary">Desconto</span>
              <span className="text-ink-tertiary">
                {discountCents > 0 ? `- ${formatBRL(discountCents)}` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-line-divider pt-2">
              <span className="font-medium text-ink">Total final</span>
              <span className="font-display text-lg font-bold text-primary">
                {formatBRL(finalCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Forma de pagamento */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-ink-secondary">Forma de pagamento</p>
          {available.length === 0 ? (
            <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
              Nenhuma forma de pagamento ativa. Ative em Configurações → Estabelecimento.
            </p>
          ) : (
            available.map((method) => {
              const isOn = selected.includes(method)
              const meta = METHOD_META[method]
              const Icon = meta.icon
              return (
                <div
                  key={method}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    isOn ? 'border-primary/40 bg-primary/5' : 'border-line',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggle(method)}
                        className="h-4 w-4 rounded border-line accent-primary"
                      />
                      <Icon className="h-4 w-4 text-ink-tertiary" />
                      <span className="text-sm font-medium text-ink">{meta.label}</span>
                    </label>
                    {isOn && (
                      <div className="relative w-24 shrink-0">
                        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-ink-tertiary">
                          R$
                        </span>
                        <input
                          inputMode="decimal"
                          value={amounts[method] ?? ''}
                          onChange={(e) => setAmount(method, e.target.value)}
                          placeholder="0,00"
                          className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-2 text-right text-sm text-ink transition-shadow duration-150 focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light"
                        />
                      </div>
                    )}
                  </div>
                  {isOn && method === 'credit' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Select
                        aria-label="Bandeira"
                        value={creditBrand}
                        onChange={(e) => {
                          setCreditBrand(e.target.value)
                          setCreditInstallments(1)
                        }}
                      >
                        {brands.length === 0 ? (
                          <option value="">Sem bandeiras</option>
                        ) : (
                          brands.map((b) => (
                            <option key={b.name} value={b.name}>
                              {b.name}
                            </option>
                          ))
                        )}
                      </Select>
                      <Select
                        aria-label="Parcelas"
                        value={String(creditInstallments)}
                        onChange={(e) => setCreditInstallments(Number(e.target.value))}
                      >
                        {Array.from({ length: Math.max(1, maxInstallments) }, (_, i) => i + 1).map(
                          (n) => (
                            <option key={n} value={n}>
                              {n}x
                            </option>
                          ),
                        )}
                      </Select>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {selected.length > 0 && remainingCents !== 0 && (
            <p
              className={cn(
                'text-xs font-medium',
                remainingCents > 0 ? 'text-warning-dark' : 'text-error-dark',
              )}
            >
              {remainingCents > 0
                ? `Falta alocar ${formatBRL(remainingCents)}`
                : `Excedeu em ${formatBRL(-remainingCents)}`}
            </p>
          )}
        </div>
      </div>

      <DialogActions>
        <Button variant="outline" size="sm" onClick={onBack} disabled={isLoading}>
          Voltar
        </Button>
        <Button size="sm" onClick={handleConfirm} isLoading={isLoading} disabled={!canFinalize}>
          Finalizar
        </Button>
      </DialogActions>
    </div>
  )
}

interface ProductPickerProps {
  catalog: Product[]
  loading: boolean
  initial: { productId: string; quantity: number }[]
  onCancel: () => void
  onSave: (items: { productId: string; quantity: number }[]) => void
}

/** Tela de seleção de produtos exibida dentro do popup de fechamento. */
function ProductPicker({ catalog, loading, initial, onCancel, onSave }: ProductPickerProps) {
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.map((it) => [it.productId, it.quantity])),
  )
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return catalog
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(term) || (p.brand?.toLowerCase().includes(term) ?? false),
    )
  }, [catalog, search])

  const selectedCount = useMemo(() => Object.values(qty).reduce((sum, q) => sum + q, 0), [qty])
  const totalCents = useMemo(
    () => catalog.reduce((sum, p) => sum + (qty[p.id] ?? 0) * p.priceCents, 0),
    [catalog, qty],
  )

  function setProductQty(product: Product, next: number) {
    const clamped = Math.max(0, Math.min(next, product.stockQuantity))
    setQty((prev) => {
      const copy = { ...prev }
      if (clamped <= 0) delete copy[product.id]
      else copy[product.id] = clamped
      return copy
    })
  }

  function handleSave() {
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([productId, quantity]) => ({ productId, quantity }))
    onSave(items)
  }

  return (
    <div className="space-y-4">
      <Input
        leftIcon={<Search className="h-4 w-4" />}
        placeholder="Buscar produto…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Carregando produtos…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            {catalog.length === 0
              ? 'Nenhum produto cadastrado. Adicione produtos em Estoque.'
              : 'Nenhum produto encontrado.'}
          </p>
        ) : (
          filtered.map((product) => {
            const current = qty[product.id] ?? 0
            const outOfStock = product.stockQuantity <= 0
            return (
              <div
                key={product.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  current > 0 ? 'border-primary/40 bg-primary/5' : 'border-line',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{product.name}</p>
                  <p className="truncate text-xs text-ink-tertiary">
                    {product.brand ? `${product.brand} · ` : ''}
                    {formatBRL(product.priceCents)}
                    {outOfStock ? (
                      <span className="text-error-dark"> · Esgotado</span>
                    ) : (
                      <span> · {product.stockQuantity} em estoque</span>
                    )}
                  </p>
                </div>
                {outOfStock ? (
                  <Badge tone="error">Esgotado</Badge>
                ) : current === 0 ? (
                  <button
                    type="button"
                    onClick={() => setProductQty(product, 1)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProductQty(product, current - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-secondary transition-colors hover:bg-background"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-medium text-ink">{current}</span>
                    <button
                      type="button"
                      onClick={() => setProductQty(product, current + 1)}
                      disabled={current >= product.stockQuantity}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-secondary transition-colors hover:bg-background disabled:opacity-40"
                      aria-label="Aumentar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="flex items-center justify-between border-t border-line-divider pt-3 text-sm">
        <span className="text-ink-secondary">
          {selectedCount > 0
            ? `${selectedCount} ${selectedCount === 1 ? 'item' : 'itens'}`
            : 'Nenhum item'}
        </span>
        <span className="font-display font-semibold text-primary">{formatBRL(totalCents)}</span>
      </div>

      <DialogActions>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Voltar
        </Button>
        <Button size="sm" onClick={handleSave}>
          Salvar
        </Button>
      </DialogActions>
    </div>
  )
}
