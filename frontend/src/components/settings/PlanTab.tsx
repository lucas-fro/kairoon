import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard, Crown, UserCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../../api/auth'
import { ApiError } from '../../api/client'
import { getPlan } from '../../api/establishment'
import {
  cancelSubscription,
  changePlan,
  getPaymentMethod,
  getPlans,
  getSubscription,
} from '../../api/payments'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatBRL, formatDate } from '../../lib/format'
import type { BillingCycle, PlanSlug } from '../../types/api'
import { BillingCycleToggle, getAnnualDiscountPercent } from '../payments/BillingCycleToggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Skeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

const FREE_FEATURES = [
  '1 profissional',
  'Agenda e agendamentos ilimitados',
  'Link público de agendamento',
  'Cadastro de clientes e histórico',
]

// Destaques por plano, mostrados nos dois cards do diálogo de upgrade.
const PLAN_HIGHLIGHTS: Record<PlanSlug, string[]> = {
  basico: [
    'Até 5 profissionais',
    'Página de agendamento personalizada',
    'Estoque e controle financeiro',
    'Fidelidade e programa de pontos',
    'Relatórios essenciais',
  ],
  essencial: [
    'Até 10 profissionais',
    'Tudo do plano Básico',
    'Relatórios avançados',
    'Cupons e campanhas de marketing',
    'CRM de clientes (aniversários e sumidos)',
  ],
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando confirmação do pagamento',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
}

function toIsoDate(value: string): string {
  return value.slice(0, 10)
}

export function PlanTab() {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  // Plano escolhido no diálogo aguardando confirmação da troca (tokenizada).
  const [confirmPlan, setConfirmPlan] = useState<PlanSlug | null>(null)
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('yearly')
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { setEstablishment } = useAuth()

  const planQuery = useQuery({ queryKey: ['plan'], queryFn: getPlan })
  const subscriptionQuery = useQuery({ queryKey: ['payments', 'subscription'], queryFn: getSubscription })
  const plansQuery = useQuery({
    queryKey: ['payments', 'plans'],
    queryFn: getPlans,
    enabled: upgradeOpen || confirmPlan !== null,
  })
  // Cartão cadastrado — buscado só quando o usuário abre a confirmação da troca.
  const paymentMethodQuery = useQuery({
    queryKey: ['payments', 'payment-method'],
    queryFn: getPaymentMethod,
    enabled: confirmPlan !== null,
  })

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      toast.success('Assinatura cancelada. O acesso continua até o fim do período já pago.')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: ['payments', 'subscription'] })
      queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
    onError: () => toast.error('Não foi possível cancelar a assinatura. Tente novamente.'),
  })

  const changeMutation = useMutation({
    mutationFn: changePlan,
    onSuccess: async () => {
      toast.success('Plano alterado com sucesso!')
      setConfirmPlan(null)
      setUpgradeOpen(false)
      // Sincroniza o plano no contexto (gating da UI) e recarrega os caches.
      try {
        const me = await getMe()
        setEstablishment(me.establishment)
      } catch {
        // Ignora: as invalidações abaixo recarregam o plano de qualquer forma.
      }
      queryClient.invalidateQueries({ queryKey: ['payments', 'subscription'] })
      queryClient.invalidateQueries({ queryKey: ['plan'] })
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível alterar o plano. Tente novamente.'),
  })

  const access = planQuery.data
  const trialState = access?.state
  const trialDaysLeft = access?.trialDaysLeft ?? 0
  const planName = access?.plan ?? 'free'
  // Durante o teste o plano efetivo é 'essencial'; rotulamos como teste para não
  // dar a impressão de que já é uma assinatura paga.
  const planLabel =
    trialState === 'trial'
      ? 'Teste grátis'
      : trialState === 'trial_expired'
        ? 'Teste encerrado'
        : `Plano ${planName.charAt(0).toUpperCase()}${planName.slice(1)}`

  const subscription = subscriptionQuery.data?.subscription ?? null
  const hasSubscriptionRecord = subscription !== null
  // Anual parcelado: as parcelas já foram compradas — não há assinatura pra
  // cancelar nem cartão tokenizado pra trocar de plano. Um registro parcelado
  // (installments>=2) é diferente da assinatura recorrente.
  const isInstallmentRecord = (subscription?.installments ?? 0) >= 2
  // Termo do parcelamento AINDA em aberto (parcelas caindo): troca e cancelamento
  // só ao fim do período pago — espelha o guard do backend (service.subscribe).
  // Depois que vence (status 'canceled'), o usuário pode assinar de novo normal.
  const installmentTermActive =
    isInstallmentRecord &&
    subscription?.status !== 'canceled' &&
    !!subscription?.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > new Date()
  const canCancel = subscription !== null && subscription.status !== 'canceled' && !installmentTermActive
  // Assinatura viva = cartão tokenizado no Asaas: dá pra trocar de plano sem
  // pedir o cartão de novo. Sem ela (free/cancelada/parcelada), cai no checkout.
  const hasActiveSub = subscription !== null && subscription.status !== 'canceled'
  const canTokenizedChange = hasActiveSub && !isInstallmentRecord

  function handlePickPlan(planSlug: PlanSlug) {
    if (installmentTermActive) {
      toast.info('Seu plano anual parcelado permite troca só ao fim do período pago.')
      return
    }
    if (canTokenizedChange) {
      // Troca tokenizada: confirma e reaproveita o cartão já cadastrado.
      setUpgradeOpen(false)
      setConfirmPlan(planSlug)
      return
    }
    navigate(`/checkout?plan=${planSlug}&cycle=${selectedCycle}`)
  }

  function closeConfirm() {
    if (changeMutation.isPending) return
    setConfirmPlan(null)
    setUpgradeOpen(true)
  }

  const confirmInfo = confirmPlan ? plansQuery.data?.[confirmPlan] : undefined
  const confirmPriceCents = confirmInfo
    ? selectedCycle === 'yearly'
      ? confirmInfo.yearlyCents
      : confirmInfo.monthlyCents
    : 0
  const savedCard = paymentMethodQuery.data ?? null
  const nextChargeLabel =
    subscription?.currentPeriodEnd && subscription.status !== 'canceled'
      ? formatDate(toIsoDate(subscription.currentPeriodEnd))
      : null

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Seu plano</CardTitle>
        <Badge tone="brand">
          <Crown className="h-3 w-3" />
          {planLabel}
        </Badge>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {FREE_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-ink-secondary">
              <Check className="h-4 w-4 shrink-0 text-success-dark" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg bg-background px-4 py-3">
          {planQuery.isPending && <Skeleton className="h-5 w-48" />}
          {planQuery.isError && (
            <span className="text-sm text-ink-secondary">
              Não foi possível carregar o uso do plano.{' '}
              <button
                type="button"
                onClick={() => planQuery.refetch()}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Tentar novamente
              </button>
            </span>
          )}
          {planQuery.data && (
            <span className="flex items-center gap-2 text-sm text-ink-secondary">
              <UserCircle className="h-4 w-4 text-primary" />
              {planQuery.data.limits.employees >= 90
                ? `Profissionais cadastrados: ${planQuery.data.usage.employees}`
                : `Profissionais: ${planQuery.data.usage.employees} de ${planQuery.data.limits.employees}`}
            </span>
          )}
        </div>

        {(trialState === 'trial' || trialState === 'trial_expired') && (
          <div
            className={`mt-3 rounded-lg px-4 py-3 text-sm ${
              trialState === 'trial_expired'
                ? 'bg-error-light text-error-dark'
                : 'bg-secondary-light text-ink-secondary'
            }`}
          >
            {trialState === 'trial'
              ? `Teste grátis com tudo desbloqueado — faltam ${trialDaysLeft} ${
                  trialDaysLeft === 1 ? 'dia' : 'dias'
                }. Assine para não perder o acesso.`
              : 'Seu teste grátis acabou. A conta está em somente-leitura até você assinar um plano.'}
          </div>
        )}

        {hasSubscriptionRecord && subscription && (
          <div className="mt-3 rounded-lg bg-background px-4 py-3 text-sm text-ink-secondary">
            <p>
              Status:{' '}
              <span className="font-medium text-ink">{STATUS_LABEL[subscription.status] ?? subscription.status}</span>
            </p>
            {subscription.status === 'canceled' && subscription.currentPeriodEnd && (
              <p className="mt-1">
                Acesso pago disponível até {formatDate(toIsoDate(subscription.currentPeriodEnd))}.
              </p>
            )}
            {subscription.status !== 'canceled' && subscription.currentPeriodEnd && (
              <p className="mt-1">
                {isInstallmentRecord
                  ? `Plano anual parcelado em ${subscription.installments}x · acesso pago até ${formatDate(
                      toIsoDate(subscription.currentPeriodEnd),
                    )}.`
                  : `Próxima cobrança em ${formatDate(toIsoDate(subscription.currentPeriodEnd))}.`}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {canCancel && (
            <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>
              Cancelar assinatura
            </Button>
          )}
          <Button type="button" onClick={() => setUpgradeOpen(true)}>
            Fazer upgrade
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Escolha seu plano"
        description="Assine para desbloquear os recursos pagos do Kairoon."
        maxWidth="max-w-2xl"
      >
        {/* Ciclo de cobrança (mensal / anual) no topo */}
        <div className="mb-5 flex justify-center">
          <BillingCycleToggle
            value={selectedCycle}
            onChange={setSelectedCycle}
            discountPercent={
              plansQuery.data
                ? getAnnualDiscountPercent(
                    (plansQuery.data.essencial ?? Object.values(plansQuery.data)[0]).monthlyCents,
                    (plansQuery.data.essencial ?? Object.values(plansQuery.data)[0]).yearlyCents,
                  )
                : 0
            }
          />
        </div>

        {/* Dois cards simplificados, um por plano */}
        {plansQuery.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : plansQuery.data ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              Object.entries(plansQuery.data) as [
                PlanSlug,
                { name: string; monthlyCents: number; yearlyCents: number },
              ][]
            ).map(([slug, info]) => {
              const priceCents = selectedCycle === 'yearly' ? info.yearlyCents : info.monthlyCents
              const isCurrent =
                hasActiveSub &&
                subscription?.planSlug === slug &&
                subscription?.billingCycle === selectedCycle
              const recommended = slug === 'essencial'
              return (
                <div
                  key={slug}
                  className={cn(
                    'flex flex-col rounded-xl border p-5',
                    recommended ? 'border-primary shadow-soft' : 'border-line',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold text-ink">{info.name}</h3>
                    {recommended && <Badge tone="brand">Recomendado</Badge>}
                  </div>
                  <div className="mt-3">
                    <span className="font-display text-2xl font-bold text-ink">
                      {formatBRL(priceCents)}
                    </span>
                    <span className="text-sm text-ink-secondary">
                      {selectedCycle === 'monthly' ? '/mês' : '/ano'}
                    </span>
                    {selectedCycle === 'yearly' && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">
                        equivale a {formatBRL(info.yearlyCents / 12)}/mês
                      </p>
                    )}
                  </div>
                  <ul className="mt-4 flex-1 space-y-2">
                    {(PLAN_HIGHLIGHTS[slug] ?? []).map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-ink-secondary">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant={recommended ? 'primary' : 'outline'}
                    className="mt-5 w-full"
                    disabled={isCurrent}
                    onClick={() => handlePickPlan(slug)}
                  >
                    {isCurrent ? 'Plano atual' : 'Assinar'}
                  </Button>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-ink-secondary">
            Não foi possível carregar os planos.
          </p>
        )}
      </Dialog>

      <Dialog
        open={confirmPlan !== null}
        onClose={closeConfirm}
        title="Confirmar troca de plano"
        description="A cobrança reaproveita o cartão já cadastrado — você não precisa digitar os dados de novo."
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="font-medium text-ink">Plano {confirmInfo?.name ?? ''}</span>
            <span className="text-right">
              <span className="block text-sm font-semibold text-primary">
                {formatBRL(confirmPriceCents)}
                {selectedCycle === 'monthly' ? '/mês' : '/ano'}
              </span>
              {selectedCycle === 'yearly' && confirmInfo && (
                <span className="block text-xs text-ink-tertiary">
                  equivale a {formatBRL(confirmInfo.yearlyCents / 12)}/mês
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-background px-4 py-3 text-sm text-ink-secondary">
            <CreditCard className="h-4 w-4 shrink-0 text-primary" />
            {paymentMethodQuery.isPending ? (
              <span>Carregando cartão cadastrado…</span>
            ) : savedCard ? (
              <span>
                Cobrança no cartão {savedCard.brand ? `${savedCard.brand} ` : ''}•••• {savedCard.last4}
              </span>
            ) : (
              <span>Cobrança no cartão já cadastrado na sua assinatura</span>
            )}
          </div>

          <p className="text-sm text-ink-secondary">
            O acesso ao plano {confirmInfo?.name ?? ''} é liberado na hora.{' '}
            {nextChargeLabel
              ? `O novo valor passa a valer a partir da próxima cobrança, em ${nextChargeLabel} — nada é cobrado agora.`
              : 'O novo valor passa a valer a partir da próxima cobrança — nada é cobrado agora.'}
          </p>
        </div>

        <DialogActions className="mt-6">
          <Button type="button" variant="outline" onClick={closeConfirm} disabled={changeMutation.isPending}>
            Voltar
          </Button>
          <Button
            type="button"
            onClick={() =>
              confirmPlan && changeMutation.mutate({ planSlug: confirmPlan, billingCycle: selectedCycle })
            }
            isLoading={changeMutation.isPending}
          >
            Confirmar troca
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar assinatura?"
        description="Você continua com acesso ao plano pago até o fim do período já pago. Depois disso, a conta volta pro plano gratuito."
        confirmLabel="Cancelar assinatura"
        danger
        isLoading={cancelMutation.isPending}
      />
    </Card>
  )
}
