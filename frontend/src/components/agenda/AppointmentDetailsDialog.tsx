import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import {
  Banknote,
  CalendarClock,
  Clock,
  CreditCard,
  Gift,
  Globe,
  Megaphone,
  Minus,
  Phone,
  Plus,
  QrCode,
  Scissors,
  Search,
  ShoppingBag,
  Stamp,
  Store,
  Ticket,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { updateAppointment } from '../../api/appointments'
import type { UpdateAppointmentPayload } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { listClientCoupons, validateCoupon } from '../../api/coupons'
import { getClientLoyalty } from '../../api/loyalty'
import { getClientPoints } from '../../api/points'
import { listProducts } from '../../api/products'
import { listServices } from '../../api/services'
import { useAuth } from '../../contexts/AuthContext'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { describeCouponDiscount } from '../../lib/coupons'
import { cn, formatBRL, formatDate, formatPhone, parseBRLToCents } from '../../lib/format'
import type {
  Appointment,
  Payment,
  PaymentMethod,
  PaymentSettings,
  Product,
  Service,
} from '../../types/api'
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
  const [checkoutSubview, setCheckoutSubview] = useState<
    'products' | 'services' | 'coupon' | null
  >(null)
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
    setCheckoutSubview(null)
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
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      queryClient.invalidateQueries({ queryKey: ['loyalty'] })
      queryClient.invalidateQueries({ queryKey: ['points'] })
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
          checkoutSubview === 'products'
            ? 'Selecionar produtos'
            : checkoutSubview === 'services'
              ? 'Adicionar serviço extra'
              : checkoutSubview === 'coupon'
                ? 'Cupom de desconto'
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
            onSubviewChange={setCheckoutSubview}
            onBack={() => setFinalizing(false)}
            onConfirm={(payments, discountCents, saleProducts, saleServices, couponCode) =>
              mutation.mutate({
                status: 'completed',
                discountCents,
                payments,
                saleProducts,
                saleServices,
                couponCode,
              })
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
              appointment.saleServices &&
              appointment.saleServices.length > 0 && (
                <div className="space-y-2 rounded-xl bg-background p-4 text-sm">
                  <p className="text-[13px] font-medium text-ink-secondary">Serviços extras</p>
                  {appointment.saleServices.map((service, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <span className="text-ink-secondary">
                        {service.quantity}× {service.name}
                      </span>
                      <span className="font-medium text-ink">
                        {formatBRL(service.quantity * service.unitPriceCents)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

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
  onSubviewChange: (view: 'products' | 'services' | 'coupon' | null) => void
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
    saleServices: { serviceId: string; quantity: number }[],
    couponCode?: string,
  ) => void
}

function PaymentCheckout({
  appointment,
  paymentSettings,
  isLoading,
  onSubviewChange,
  onBack,
  onConfirm,
}: PaymentCheckoutProps) {
  const productsQuery = useQuery({ queryKey: ['products'], queryFn: listProducts })
  const catalog = useMemo(
    () => (productsQuery.data ?? []).filter((p) => p.active),
    [productsQuery.data],
  )
  const catalogById = useMemo(() => new Map(catalog.map((p) => [p.id, p])), [catalog])

  const extraServicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })
  const serviceCatalog = useMemo(
    () => (extraServicesQuery.data ?? []).filter((s) => s.active),
    [extraServicesQuery.data],
  )
  const serviceCatalogById = useMemo(
    () => new Map(serviceCatalog.map((s) => [s.id, s])),
    [serviceCatalog],
  )

  const [saleItems, setSaleItems] = useState<{ productId: string; quantity: number }[]>([])
  const [saleServiceItems, setSaleServiceItems] = useState<{ serviceId: string; quantity: number }[]>(
    [],
  )
  const [view, setView] = useState<'checkout' | 'products' | 'services' | 'coupon'>('checkout')

  function openView(next: 'products' | 'services' | 'coupon') {
    setView(next)
    onSubviewChange(next)
  }

  function closeView() {
    setView('checkout')
    onSubviewChange(null)
  }

  function applyPickedProducts(items: { productId: string; quantity: number }[]) {
    setSaleItems(items)
    closeView()
  }

  function applyPickedServices(items: { serviceId: string; quantity: number }[]) {
    setSaleServiceItems(items)
    closeView()
  }

  const servicesCents = appointment.service.priceCents
  const productsCents = saleItems.reduce(
    (sum, item) => sum + (catalogById.get(item.productId)?.priceCents ?? 0) * item.quantity,
    0,
  )
  const extraServicesCents = saleServiceItems.reduce(
    (sum, item) => sum + (serviceCatalogById.get(item.serviceId)?.priceCents ?? 0) * item.quantity,
    0,
  )
  const subtotalCents = servicesCents + productsCents + extraServicesCents

  // Linhas de serviço do resumo: o serviço agendado é a base (1×) e cada serviço
  // extra igual a ele soma na mesma linha (evita duplicar). Assim todas as linhas
  // exibem "N×", inclusive a do serviço agendado.
  const serviceLines = useMemo(() => {
    const lines = [
      {
        id: appointment.service.id,
        name: appointment.service.name,
        quantity: 1,
        unitPriceCents: appointment.service.priceCents,
      },
    ]
    for (const item of saleServiceItems) {
      const service = serviceCatalogById.get(item.serviceId)
      if (!service) continue
      const existing = lines.find((line) => line.id === item.serviceId)
      if (existing) existing.quantity += item.quantity
      else
        lines.push({
          id: item.serviceId,
          name: service.name,
          quantity: item.quantity,
          unitPriceCents: service.priceCents,
        })
    }
    return lines
  }, [appointment.service, saleServiceItems, serviceCatalogById])

  const clientId = appointment.client.id

  // Cupom digitado: validado no servidor (revalida sozinho quando o subtotal
  // muda, ex.: produtos entram/saem).
  const [couponInput, setCouponInput] = useState('')
  const [appliedCode, setAppliedCode] = useState<string | null>(null)
  const [manualDiscount, setManualDiscount] = useState('')

  const couponQuery = useQuery({
    queryKey: ['coupons', 'validate', appointment.id, appliedCode, subtotalCents],
    queryFn: () =>
      validateCoupon({
        code: appliedCode!,
        clientId,
        serviceId: appointment.service.id,
        subtotalCents,
        date: appointment.date,
        appointmentId: appointment.id,
      }),
    enabled: Boolean(appliedCode),
    retry: false,
  })
  const appliedCoupon = appliedCode ? (couponQuery.data?.coupon ?? null) : null
  const couponError =
    appliedCode && couponQuery.isError
      ? couponQuery.error instanceof ApiError
        ? couponQuery.error.message
        : 'Não foi possível validar o cupom'
      : null

  const manualDiscountCents = Math.min(parseBRLToCents(manualDiscount), subtotalCents)

  // Campanha automática: só quando não há cupom digitado nem desconto manual
  // (mesma regra do servidor).
  const campaignQuery = useQuery({
    queryKey: ['coupons', 'campaign-preview', appointment.id, subtotalCents],
    queryFn: () =>
      validateCoupon({
        clientId,
        serviceId: appointment.service.id,
        subtotalCents,
        date: appointment.date,
        appointmentId: appointment.id,
      }),
    enabled: !appliedCode && manualDiscountCents === 0,
    retry: false,
  })
  const campaignCoupon =
    !appliedCode && manualDiscountCents === 0 ? (campaignQuery.data?.coupon ?? null) : null

  // Cupons pessoais do cliente (recompensas de fidelidade/pontos) + resumo
  const clientCouponsQuery = useQuery({
    queryKey: ['coupons', 'client', clientId],
    queryFn: () => listClientCoupons(clientId),
  })
  const loyaltyQuery = useQuery({
    queryKey: ['loyalty', 'client', clientId],
    queryFn: () => getClientLoyalty(clientId),
  })
  const pointsQuery = useQuery({
    queryKey: ['points', 'client', clientId],
    queryFn: () => getClientPoints(clientId),
  })
  const fidelitySummary = [
    loyaltyQuery.data?.program?.active
      ? `${loyaltyQuery.data.availableStamps}/${loyaltyQuery.data.program.stampsRequired} carimbos`
      : null,
    pointsQuery.data?.program?.active ? `${pointsQuery.data.balance} pontos` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const discountCents = appliedCoupon
    ? appliedCoupon.discountCents
    : campaignCoupon
      ? campaignCoupon.discountCents
      : manualDiscountCents
  const finalCents = Math.max(0, subtotalCents - discountCents)

  function applyCouponCode(code: string) {
    const normalized = code.trim().toUpperCase()
    if (!normalized) return
    setCouponInput(normalized)
    setAppliedCode(normalized)
  }

  function clearCoupon() {
    setAppliedCode(null)
    setCouponInput('')
  }

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
    // Com cupom ou campanha, o servidor recalcula o desconto (fonte da
    // verdade); o desconto manual só vale sem cupom.
    const manualToSend = appliedCoupon || campaignCoupon ? 0 : manualDiscountCents
    onConfirm(
      payments,
      manualToSend,
      saleItems,
      saleServiceItems,
      appliedCoupon?.code ?? undefined,
    )
  }

  if (view === 'products') {
    return (
      <ProductPicker
        catalog={catalog}
        loading={productsQuery.isLoading}
        initial={saleItems}
        onCancel={closeView}
        onSave={applyPickedProducts}
      />
    )
  }

  if (view === 'services') {
    return (
      <ServicePicker
        catalog={serviceCatalog}
        loading={extraServicesQuery.isLoading}
        initial={saleServiceItems}
        onCancel={closeView}
        onSave={applyPickedServices}
      />
    )
  }

  if (view === 'coupon') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {appliedCoupon ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <Ticket className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate font-mono font-medium text-ink">
                  {appliedCoupon.code}
                </span>
                <span className="shrink-0 text-xs text-ink-tertiary">
                  {describeCouponDiscount(appliedCoupon.discountType, appliedCoupon.discountValue)}
                </span>
              </div>
              <button
                type="button"
                onClick={clearCoupon}
                className="shrink-0 text-xs font-medium text-error-dark hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  leftIcon={<Ticket className="h-4 w-4" />}
                  placeholder="Cupom (opcional)"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={!couponInput.trim() || (Boolean(appliedCode) && couponQuery.isLoading)}
                onClick={() => applyCouponCode(couponInput)}
              >
                Aplicar
              </Button>
            </div>
          )}
          {couponError && <p className="text-xs font-medium text-error-dark">{couponError}</p>}

          {/* Recompensas cunhadas disponíveis do cliente — aplicar em um toque */}
          {!appliedCoupon &&
            (clientCouponsQuery.data ?? [])
              .filter((coupon) => coupon.code)
              .map((coupon) => (
                <button
                  key={coupon.id}
                  type="button"
                  onClick={() => applyCouponCode(coupon.code!)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Gift className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="shrink-0 font-mono font-medium text-ink">{coupon.code}</span>
                    {coupon.name && (
                      <span className="truncate text-ink-tertiary">{coupon.name}</span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium text-primary">
                    {describeCouponDiscount(coupon.discountType, coupon.discountValue)}
                  </span>
                </button>
              ))}

          {campaignCoupon && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary-light/60 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5 text-ink-secondary">
                <Megaphone className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">
                  Campanha{campaignCoupon.name ? ` "${campaignCoupon.name}"` : ''} aplicada
                  automaticamente
                </span>
              </span>
              <span className="shrink-0 font-medium text-primary">
                − {formatBRL(campaignCoupon.discountCents)}
              </span>
            </div>
          )}

          <Input
            aria-label="Desconto manual"
            inputMode="decimal"
            placeholder="Desconto manual (opcional)"
            leftIcon={<span className="text-sm">R$</span>}
            value={manualDiscount}
            onChange={(e) => setManualDiscount(e.target.value.replace(/[^\d,]/g, ''))}
            disabled={Boolean(appliedCoupon)}
          />
        </div>

        <DialogActions>
          <Button variant="outline" size="sm" onClick={closeView}>
            Voltar
          </Button>
        </DialogActions>
      </div>
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
            {fidelitySummary && (
              <div className="flex items-center gap-3">
                <Stamp className="h-4 w-4 shrink-0 text-ink-tertiary" />
                <p className="text-ink-secondary">{fidelitySummary}</p>
              </div>
            )}
          </div>

          {/* Produtos, serviços extras e cupom */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => openView('products')}
              className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <ShoppingBag className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <span>Produtos</span>
              {saleItems.length > 0 && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
                  {saleItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => openView('services')}
              className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Scissors className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <span>Serviços</span>
              {saleServiceItems.length > 0 && (
                <span className="ml-auto flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-white">
                  {saleServiceItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => openView('coupon')}
              className="relative flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Ticket className="h-4 w-4 shrink-0 text-ink-tertiary" />
              <span>Cupom</span>
              {(appliedCoupon || campaignCoupon || manualDiscountCents > 0) && (
                <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-primary" />
              )}
            </button>
          </div>

          <div className="space-y-2 text-sm">
            {serviceLines.map((line) => (
              <div key={line.id} className="flex items-center justify-between">
                <span className="text-ink-secondary">
                  {line.quantity}× {line.name}
                </span>
                <span className="text-ink">
                  {formatBRL(line.unitPriceCents * line.quantity)}
                </span>
              </div>
            ))}
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
              <span className="text-ink-secondary">
                Desconto
                {appliedCoupon ? ` (${appliedCoupon.code})` : campaignCoupon ? ' (campanha)' : ''}
              </span>
              <span
                className={discountCents > 0 ? 'font-medium text-success-dark' : 'text-ink-tertiary'}
              >
                {discountCents > 0 ? `− ${formatBRL(discountCents)}` : '—'}
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

interface ServicePickerProps {
  catalog: Service[]
  loading: boolean
  initial: { serviceId: string; quantity: number }[]
  onCancel: () => void
  onSave: (items: { serviceId: string; quantity: number }[]) => void
}

/** Tela para adicionar serviços extras (além do serviço principal) no fechamento. */
function ServicePicker({ catalog, loading, initial, onCancel, onSave }: ServicePickerProps) {
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(initial.map((it) => [it.serviceId, it.quantity])),
  )
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return catalog
    return catalog.filter((s) => s.name.toLowerCase().includes(term))
  }, [catalog, search])

  const selectedCount = useMemo(() => Object.values(qty).reduce((sum, q) => sum + q, 0), [qty])
  const totalCents = useMemo(
    () => catalog.reduce((sum, s) => sum + (qty[s.id] ?? 0) * s.priceCents, 0),
    [catalog, qty],
  )

  function setServiceQty(service: Service, next: number) {
    const clamped = Math.max(0, Math.min(next, 20))
    setQty((prev) => {
      const copy = { ...prev }
      if (clamped <= 0) delete copy[service.id]
      else copy[service.id] = clamped
      return copy
    })
  }

  function handleSave() {
    const items = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([serviceId, quantity]) => ({ serviceId, quantity }))
    onSave(items)
  }

  return (
    <div className="space-y-4">
      <Input
        leftIcon={<Search className="h-4 w-4" />}
        placeholder="Buscar serviço…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">Carregando serviços…</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-tertiary">
            {catalog.length === 0
              ? 'Nenhum serviço cadastrado.'
              : 'Nenhum serviço encontrado.'}
          </p>
        ) : (
          filtered.map((service) => {
            const current = qty[service.id] ?? 0
            return (
              <div
                key={service.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                  current > 0 ? 'border-primary/40 bg-primary/5' : 'border-line',
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{service.name}</p>
                  <p className="truncate text-xs text-ink-tertiary">
                    {formatBRL(service.priceCents)}
                  </p>
                </div>
                {current === 0 ? (
                  <button
                    type="button"
                    onClick={() => setServiceQty(service, 1)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </button>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setServiceQty(service, current - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-secondary transition-colors hover:bg-background"
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-medium text-ink">{current}</span>
                    <button
                      type="button"
                      onClick={() => setServiceQty(service, current + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-secondary transition-colors hover:bg-background"
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
