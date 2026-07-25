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
import { cn, formatBRL } from '../../lib/format'
import type {
  BillingCycle,
  PlanFeatureKey,
  PlanInfo,
  PlanSlug,
  Subscription,
} from '../../types/api'
import { BillingCycleToggle, getAnnualDiscountPercent } from '../payments/BillingCycleToggle'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Skeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

// Rótulo de cada recurso gateável. A lista do plano ATUAL é derivada do mapa
// `features` que o backend devolve, nunca de um mapa fixo por slug: era assim
// que o plano Profissional (ilimitado) acabava anunciando "Até 10 profissionais".
const FEATURE_LABELS: [PlanFeatureKey, string][] = [
  ['personalizacao', 'Página de agendamento personalizada'],
  ['estoque', 'Controle de estoque'],
  ['fidelidade', 'Fidelidade e programa de pontos'],
  ['financeiro', 'Controle financeiro'],
  ['relatorios', 'Relatórios essenciais'],
  ['relatorios_avancados', 'Relatórios avançados'],
  ['cupons', 'Cupons e campanhas de marketing'],
  ['clientes_crm', 'CRM de clientes (aniversários e sumidos)'],
]

// Espelha UNLIMITED (999) de backend/src/lib/plans.ts: o limite trafega como
// número, então "ilimitado" é qualquer teto absurdamente alto.
const UNLIMITED_EMPLOYEES = 90

function employeesLabel(limit: number): string {
  if (limit >= UNLIMITED_EMPLOYEES) return 'Profissionais ilimitados'
  return limit === 1 ? '1 profissional' : `Até ${limit} profissionais`
}

/** O que a conta REALMENTE tem agora, montado a partir da resposta de getPlan. */
function currentPlanFeatures(access: PlanInfo): string[] {
  return [
    employeesLabel(access.limits.employees),
    ...FEATURE_LABELS.filter(([key]) => access.features[key]).map(([, label]) => label),
  ]
}

/**
 * Rótulo do badge, calculado só com o plano JÁ carregado. Derivar de um fallback
 * fazia a tela afirmar "Plano Free" (um plano que nem existe no catálogo)
 * enquanto a query estava em voo, e para sempre se ela falhasse.
 */
function planBadgeLabel(access: PlanInfo, hadSubscription: boolean): string {
  switch (access.state) {
    case 'trial':
      return 'Teste grátis'
    case 'trial_expired':
      // Quem já assinou não teve um "teste" encerrado: teve a assinatura encerrada.
      return hadSubscription ? 'Assinatura encerrada' : 'Teste encerrado'
    case 'paid':
      return `Plano ${access.planName}`
  }
}

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

/**
 * Timestamp ISO (UTC) → 'DD/MM/AAAA' no fuso do usuário. Fatiar a string ISO
 * mostrava o dia seguinte para compras feitas à noite no horário de Brasília.
 */
function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now()
}

/**
 * Texto do período pago. Compara a data com o presente: antes, "acesso pago
 * disponível até X" e "próxima cobrança em X" continuavam no presente mesmo
 * depois de X ter passado.
 */
function subscriptionPeriodLabel(subscription: Subscription): string | null {
  const end = subscription.currentPeriodEnd
  if (!end) return null
  const date = formatTimestamp(end)
  const ended = isPast(end)

  if (subscription.status === 'canceled') {
    return ended ? `Acesso pago encerrado em ${date}.` : `Acesso pago disponível até ${date}.`
  }
  if ((subscription.installments ?? 0) >= 2) {
    return ended
      ? `Plano anual parcelado em ${subscription.installments}x · acesso pago encerrado em ${date}.`
      : `Plano anual parcelado em ${subscription.installments}x · acesso pago até ${date}.`
  }
  // Recorrente: o webhook PAYMENT_CONFIRMED avança o período a cada cobrança
  // confirmada, então uma data no passado significa renovação ainda em curso.
  return ended
    ? `Renovação em processamento (vencimento em ${date}).`
    : `Próxima cobrança em ${date}.`
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
  // Cartão cadastrado: buscado só quando o usuário abre a confirmação da troca.
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
    onError: (err) =>
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível cancelar a assinatura. Tente novamente.',
      ),
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

  const subscription = subscriptionQuery.data?.subscription ?? null
  // A escolha entre troca tokenizada e checkout depende deste dado. Enquanto ele
  // não chega (ou falha), tratar como "sem assinatura" mandaria um assinante pro
  // checkout e o cobraria de novo, por isso os botões esperam.
  const subscriptionReady = subscriptionQuery.isSuccess
  const hadSubscription = subscription !== null

  const planLabel = access ? planBadgeLabel(access, hadSubscription) : null

  // Recursos exibidos abaixo do badge: o que a conta TEM agora, derivado do
  // payload. Em trial_expired (travada) e free (sem assinatura) não há lista de
  // benefícios a exibir: o aviso logo abaixo explica o estado.
  const planFeaturesList =
    access && (access.state === 'paid' || access.state === 'trial')
      ? currentPlanFeatures(access)
      : null
  // Anual parcelado: as parcelas já foram compradas; não há assinatura pra
  // cancelar nem cartão tokenizado pra trocar de plano. Um registro parcelado
  // (installments>=2) é diferente da assinatura recorrente.
  const isInstallmentRecord = (subscription?.installments ?? 0) >= 2
  // Termo do parcelamento AINDA em aberto (parcelas caindo): troca e cancelamento
  // só ao fim do período pago: espelha o guard do backend (service.subscribe).
  // Depois que vence (status 'canceled'), o usuário pode assinar de novo normal.
  const installmentTermActive =
    isInstallmentRecord &&
    subscription?.status !== 'canceled' &&
    !!subscription?.currentPeriodEnd &&
    new Date(subscription.currentPeriodEnd) > new Date()
  // Exige também acesso pago vigente: quando o período vence, o registro ainda
  // pode chegar como 'active' de /payments/subscription enquanto o motor de
  // acesso já o encerrou, e o cancelamento então falharia com 404.
  const canCancel =
    access?.state === 'paid' &&
    subscription !== null &&
    subscription.status !== 'canceled' &&
    !installmentTermActive
  // Assinatura viva = cartão tokenizado no Asaas: dá pra trocar de plano sem
  // pedir o cartão de novo. Sem ela (free/cancelada/parcelada), cai no checkout.
  const hasActiveSub = subscription !== null && subscription.status !== 'canceled'
  const canTokenizedChange = hasActiveSub && !isInstallmentRecord

  // Abre o diálogo no ciclo que a conta já assina: abrir sempre no anual fazia o
  // card do plano atual aparecer como "Assinar", com um preço que ela não paga.
  function openUpgrade() {
    if (subscription?.billingCycle) setSelectedCycle(subscription.billingCycle)
    setUpgradeOpen(true)
  }

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
  const periodLabel = subscription ? subscriptionPeriodLabel(subscription) : null
  // Só anuncia a data da próxima cobrança se ela ainda estiver no futuro.
  const nextChargeLabel =
    subscription?.currentPeriodEnd &&
    subscription.status !== 'canceled' &&
    !isPast(subscription.currentPeriodEnd)
      ? formatTimestamp(subscription.currentPeriodEnd)
      : null

  // A copy antiga ("Assine para desbloquear os recursos pagos") era falsa em dois
  // estados: no teste tudo já está liberado, e quem já paga não tem nada travado.
  const upgradeDescription =
    trialState === 'trial'
      ? `Escolha um plano para não perder o acesso quando o teste acabar (faltam ${trialDaysLeft} ${
          trialDaysLeft === 1 ? 'dia' : 'dias'
        }).`
      : trialState === 'paid'
        ? 'Compare os planos e altere sua assinatura quando quiser.'
        : trialState === 'trial_expired'
          ? 'Assine um plano para voltar a criar e editar na sua conta.'
          : 'Assine um plano para liberar todos os recursos do Kairoon.'

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Seu plano</CardTitle>
        {/* Sem dado carregado não há rótulo: o badge não pode "chutar" um plano. */}
        {planQuery.isPending ? (
          <Skeleton className="h-6 w-32 rounded-full" />
        ) : planLabel ? (
          <Badge tone="brand">
            <Crown className="h-3 w-3" />
            {planLabel}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {planFeaturesList && (
          <ul className="space-y-2">
            {planFeaturesList.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-ink-secondary">
                <Check className="h-4 w-4 shrink-0 text-success-dark" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 rounded-lg bg-background px-4 py-3">
          {planQuery.isPending && <Skeleton className="h-5 w-48" />}
          {planQuery.isError && (
            <span className="text-sm text-ink-secondary">
              Não foi possível carregar o seu plano.{' '}
              <button
                type="button"
                onClick={() => planQuery.refetch()}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Tentar novamente
              </button>
            </span>
          )}
          {access && (
            <span className="flex items-center gap-2 text-sm text-ink-secondary">
              <UserCircle className="h-4 w-4 text-primary" />
              {/* Em somente-leitura o limite não é capacidade disponível: nenhum
                  cadastro passa, então anunciar "3 de 10" prometia 7 vagas. */}
              {!access.canWrite
                ? `Profissionais cadastrados: ${access.usage.employees} · novos cadastros bloqueados`
                : access.limits.employees >= UNLIMITED_EMPLOYEES
                  ? `Profissionais cadastrados: ${access.usage.employees}`
                  : `Profissionais: ${access.usage.employees} de ${access.limits.employees}`}
            </span>
          )}
        </div>

        {access && access.state !== 'paid' && (
          <div
            className={`mt-3 rounded-lg px-4 py-3 text-sm ${
              access.state === 'trial_expired'
                ? 'bg-error-light text-error-dark'
                : 'bg-secondary-light text-ink-secondary'
            }`}
          >
            {access.state === 'trial'
              ? `Teste grátis com tudo desbloqueado. Faltam ${trialDaysLeft} ${
                  trialDaysLeft === 1 ? 'dia' : 'dias'
                }. Assine para não perder o acesso.`
              : hadSubscription
                ? 'Sua assinatura terminou. A conta está em somente-leitura até você assinar de novo.'
                : 'Seu teste grátis acabou. A conta está em somente-leitura até você assinar um plano.'}
          </div>
        )}

        {/* Falha aqui fazia a página parecer "sem assinatura": o bloco de status
            sumia sem aviso e a compra era desviada pro checkout. */}
        {subscriptionQuery.isError && (
          <div className="mt-3 rounded-lg bg-background px-4 py-3 text-sm text-ink-secondary">
            Não foi possível carregar sua assinatura.{' '}
            <button
              type="button"
              onClick={() => subscriptionQuery.refetch()}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {subscription && (
          <div className="mt-3 rounded-lg bg-background px-4 py-3 text-sm text-ink-secondary">
            <p>
              Status:{' '}
              <span className="font-medium text-ink">{STATUS_LABEL[subscription.status] ?? subscription.status}</span>
            </p>
            {periodLabel && <p className="mt-1">{periodLabel}</p>}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {canCancel && (
            <Button type="button" variant="outline" onClick={() => setCancelOpen(true)}>
              Cancelar assinatura
            </Button>
          )}
          {/* Acima do catálogo (Profissional) o diálogo só teria planos
              INFERIORES: "Fazer upgrade" ali levava a um downgrade cobrado. */}
          {access?.isAboveCatalog ? (
            <p className="text-sm text-ink-secondary">
              Você está no plano mais completo. Fale com o suporte para alterar sua assinatura.
            </p>
          ) : (
            <Button type="button" onClick={openUpgrade} disabled={!subscriptionReady}>
              {trialState === 'paid' ? 'Mudar de plano' : 'Assinar um plano'}
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title={trialState === 'paid' ? 'Mudar de plano' : 'Escolha seu plano'}
        description={upgradeDescription}
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
              // Sempre destaca o equivalente mensal (mesmo no ciclo anual): o
              // total do ano some para um texto pequeno abaixo, parcelado, pra
              // não assustar como um número grande sozinho assustaria.
              const monthlyEquivalentCents =
                selectedCycle === 'yearly' ? info.yearlyCents / 12 : info.monthlyCents
              // O plano assinado é o mesmo independentemente do ciclo escolhido
              // no toggle; só o botão muda (trocar de ciclo vs já é o atual).
              const isCurrentPlan = hasActiveSub && subscription?.planSlug === slug
              const isCurrentCycle = isCurrentPlan && subscription?.billingCycle === selectedCycle
              const recommended = slug === 'essencial' && !isCurrentPlan
              return (
                <div
                  key={slug}
                  className={cn(
                    'relative flex flex-col rounded-xl border p-5 pt-6',
                    recommended
                      ? 'border-2 border-primary bg-secondary-light shadow-soft'
                      : 'border-line',
                  )}
                >
                  {recommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white shadow-soft">
                      Recomendado
                    </span>
                  )}
                  <h3 className="font-display text-base font-semibold text-ink">
                    {info.name}
                    {isCurrentPlan && (
                      <span className="ml-2 text-xs font-medium text-primary">
                        Plano atual ({subscription?.billingCycle === 'yearly' ? 'anual' : 'mensal'})
                      </span>
                    )}
                  </h3>
                  <div className="mt-3">
                    <span className="font-display text-2xl font-bold text-ink">
                      {formatBRL(monthlyEquivalentCents)}
                    </span>
                    <span className="text-sm text-ink-secondary">/mês</span>
                    {selectedCycle === 'yearly' && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">
                        {/* Parcelar só existe no checkout: a troca tokenizada
                            (changePlan) faz uma cobrança anual única. */}
                        {canTokenizedChange
                          ? `${formatBRL(info.yearlyCents)} cobrados uma vez por ano`
                          : `${formatBRL(info.yearlyCents)}/ano em até 12x no cartão`}
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
                  {/* O motivo aparece no card, não num toast depois do clique. */}
                  {installmentTermActive && subscription?.currentPeriodEnd && (
                    <p className="mt-3 text-xs text-ink-tertiary">
                      Troca disponível ao fim do período pago, em{' '}
                      {formatTimestamp(subscription.currentPeriodEnd)}.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant={recommended ? 'primary' : 'outline'}
                    className="mt-5 w-full"
                    disabled={isCurrentCycle || installmentTermActive}
                    onClick={() => handlePickPlan(slug)}
                  >
                    {isCurrentCycle
                      ? 'Plano atual'
                      : installmentTermActive
                        ? 'Indisponível agora'
                        : isCurrentPlan
                          ? 'Mudar para este ciclo'
                          : 'Assinar'}
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
        description="A cobrança reaproveita o cartão já cadastrado: você não precisa digitar os dados de novo."
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
              ? `O novo valor passa a valer a partir da próxima cobrança, em ${nextChargeLabel}; nada é cobrado agora.`
              : 'O novo valor passa a valer a partir da próxima cobrança; nada é cobrado agora.'}
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
        description="Você continua com acesso ao plano pago até o fim do período já pago. Depois disso, a conta fica em somente-leitura (dá para consultar os dados, mas não criar, editar ou excluir nada) até você assinar de novo."
        confirmLabel="Cancelar assinatura"
        danger
        isLoading={cancelMutation.isPending}
      />
    </Card>
  )
}
