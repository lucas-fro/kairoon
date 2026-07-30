import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CreditCard } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getMe } from '../../api/auth'
import { ApiError } from '../../api/client'
import { changePlan, getPaymentMethod, getPlans, getPromo, getSubscription } from '../../api/payments'
import { useAuth } from '../../contexts/AuthContext'
import { usePlan } from '../../hooks/usePlan'
import { cn, formatBRL, formatTimestampBR } from '../../lib/format'
import { isPromoEligible } from '../../lib/promo'
import {
  canChangeWithSavedCard,
  hasActiveSubscription,
  isInstallmentTermActive,
  isPeriodActive,
} from '../../lib/subscription'
import type { BillingCycle, PlanSlug } from '../../types/api'
import { BillingCycleToggle, getAnnualDiscountPercent } from '../payments/BillingCycleToggle'
import { PromoBanner } from './PromoBanner'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Skeleton } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

// Destaques por plano, mostrados nos cards do diálogo.
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

/**
 * O Profissional NÃO passa pelo checkout: ele não está em PLANS
 * (backend/src/lib/plans.ts), é fechado com o comercial e gravado manualmente no
 * banco. Por isso entra como card fixo, com o preço de referência e o CTA de
 * consulta que a LP publica (LP/index.html#planos), em vez de vir de /payments/plans.
 */
const PROFISSIONAL = {
  name: 'Profissional',
  /** Preço de referência da LP; o valor final é fechado na consulta. */
  monthlyCents: 34_900,
  highlights: [
    'Profissionais ilimitados',
    'Tudo do plano Essencial',
    'Múltiplas unidades em um só painel',
    'Suporte com gerente dedicado',
  ],
  whatsappUrl: `https://wa.me/5511981415034?text=${encodeURIComponent(
    'Olá! Tenho interesse no plano Profissional do Kairoon e gostaria de fazer uma consulta.',
  )}`,
}

interface PlanUpgradeDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Diálogo de escolha/troca de plano. Fonte ÚNICA do fluxo de upgrade: é o mesmo
 * componente aberto pelo card de Configurações › Plano e pelas chamadas de
 * upgrade do header e da sidebar, que antes só levavam para lá.
 *
 * São dois passos no mesmo `open`: a grade de planos e, quando a conta já tem
 * cartão tokenizado, a confirmação da troca. O pai só liga e desliga o fluxo.
 */
export function PlanUpgradeDialog({ open, onClose }: PlanUpgradeDialogProps) {
  // Plano escolhido aguardando confirmação da troca tokenizada.
  const [confirmPlan, setConfirmPlan] = useState<PlanSlug | null>(null)
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>('yearly')
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { setEstablishment } = useAuth()

  const { data: access } = usePlan()
  // As duas queries só disparam com o diálogo aberto: ele fica montado no header
  // de todas as telas do painel, e buscar isso em toda navegação seria em vão.
  const subscriptionQuery = useQuery({
    queryKey: ['payments', 'subscription'],
    queryFn: getSubscription,
    enabled: open,
  })
  const plansQuery = useQuery({ queryKey: ['payments', 'plans'], queryFn: getPlans, enabled: open })
  const promoQuery = useQuery({ queryKey: ['payments', 'promo'], queryFn: getPromo, enabled: open })
  // Cartão cadastrado: buscado só no passo de confirmação da troca.
  const paymentMethodQuery = useQuery({
    queryKey: ['payments', 'payment-method'],
    queryFn: getPaymentMethod,
    enabled: confirmPlan !== null,
  })

  const changeMutation = useMutation({
    mutationFn: changePlan,
    onSuccess: async () => {
      toast.success('Plano alterado com sucesso!')
      setConfirmPlan(null)
      onClose()
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
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível alterar o plano. Tente novamente.',
      ),
  })

  const subscription = subscriptionQuery.data?.subscription ?? null
  // A escolha entre troca tokenizada e checkout depende deste dado. Enquanto ele
  // não chega (ou falha), tratar como "sem assinatura" mandaria um assinante pro
  // checkout e o cobraria de novo, por isso os botões esperam.
  const subscriptionReady = subscriptionQuery.isSuccess
  const hasActiveSub = hasActiveSubscription(subscription)
  const canTokenizedChange = canChangeWithSavedCard(subscription)
  const installmentTermActive = isInstallmentTermActive(subscription)

  // A campanha é anunciada para TODA conta que abre o diálogo, inclusive quem
  // já paga: é chamada de marketing, e some sozinha quando ACTIVE_PROMO virar
  // null no backend. Não espera a assinatura carregar justamente por não
  // depender dela.
  const promo = promoQuery.data ?? null
  // Quem de fato consegue aplicar o cupom, que é mais restrito do que quem o
  // vê: o backend (resolvePromoForSubscribe) recusa assinatura ativa e quem já
  // pagou alguma vez, mesmo tendo cancelado (o cancelamento preserva a linha).
  const usablePromo =
    promo && subscriptionReady && isPromoEligible(subscription, subscriptionQuery.data?.payments)
      ? promo
      : null

  const subscribedCycle = subscription?.billingCycle
  // Abre no ciclo que a conta já assina: abrir sempre no anual fazia o card do
  // plano atual aparecer como "Assinar", com um preço que ela não paga.
  useEffect(() => {
    if (open && subscribedCycle) setSelectedCycle(subscribedCycle)
  }, [open, subscribedCycle])

  function handlePickPlan(planSlug: PlanSlug) {
    if (canTokenizedChange) {
      // Troca tokenizada: confirma e reaproveita o cartão já cadastrado.
      setConfirmPlan(planSlug)
      return
    }
    onClose()
    // Leva o cupom junto pra ele já chegar preenchido no checkout: quem clicou
    // vindo do banner não devia ter que digitar o código de novo. Só para quem
    // se qualifica: pré-preencher um código que o backend vai recusar abriria o
    // checkout já com mensagem de erro.
    const coupon = usablePromo ? `&coupon=${encodeURIComponent(usablePromo.code)}` : ''
    navigate(`/checkout?plan=${planSlug}&cycle=${selectedCycle}${coupon}`)
  }

  const confirmInfo = confirmPlan ? plansQuery.data?.[confirmPlan] : undefined
  const confirmPriceCents = confirmInfo
    ? selectedCycle === 'yearly'
      ? confirmInfo.yearlyCents
      : confirmInfo.monthlyCents
    : 0
  const savedCard = paymentMethodQuery.data ?? null
  // Só anuncia a data da próxima cobrança se ela ainda estiver no futuro.
  const nextChargeLabel =
    subscription?.currentPeriodEnd &&
    subscription.status !== 'canceled' &&
    isPeriodActive(subscription)
      ? formatTimestampBR(subscription.currentPeriodEnd)
      : null

  // A copy antiga ("Assine para desbloquear os recursos pagos") era falsa em dois
  // estados: no teste tudo já está liberado, e quem já paga não tem nada travado.
  const trialDaysLeft = access?.trialDaysLeft ?? 0
  const upgradeDescription =
    access?.state === 'trial'
      ? `Escolha um plano para não perder o acesso quando o teste acabar (faltam ${trialDaysLeft} ${
          trialDaysLeft === 1 ? 'dia' : 'dias'
        }).`
      : access?.state === 'paid'
        ? 'Compare os planos e altere sua assinatura quando quiser.'
        : access?.state === 'trial_expired'
          ? 'Assine um plano para voltar a criar e editar na sua conta.'
          : 'Assine um plano para liberar todos os recursos do Kairoon.'

  return (
    <>
      <Dialog
        open={open && confirmPlan === null}
        onClose={onClose}
        title={access?.state === 'paid' ? 'Mudar de plano' : 'Escolha seu plano'}
        description={upgradeDescription}
        maxWidth="max-w-4xl"
      >
        {promo && <PromoBanner promo={promo} billingCycle={selectedCycle} />}

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

        {/* Sem a assinatura carregada não dá pra saber se a compra é troca
            tokenizada ou checkout: sem esta saída, os cards ficariam travados. */}
        {subscriptionQuery.isError && (
          <div className="mb-4 rounded-lg bg-background px-4 py-3 text-sm text-ink-secondary">
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

        {plansQuery.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : plansQuery.data ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    recommended ? 'border-2 border-primary bg-secondary-light shadow-soft' : 'border-line',
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
                      {formatTimestampBR(subscription.currentPeriodEnd)}.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant={recommended ? 'primary' : 'outline'}
                    className="mt-5 w-full"
                    disabled={isCurrentCycle || installmentTermActive || !subscriptionReady}
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

            {/* Terceiro card: fechado com o comercial, não pelo checkout. Em duas
                colunas ele sobra sozinho na segunda linha, então ocupa a linha. */}
            <div className="relative flex flex-col rounded-xl border border-line p-5 pt-6 sm:col-span-2 lg:col-span-1">
              <h3 className="font-display text-base font-semibold text-ink">{PROFISSIONAL.name}</h3>
              <div className="mt-3">
                <span className="font-display text-2xl font-bold text-ink">
                  {formatBRL(PROFISSIONAL.monthlyCents)}
                </span>
                <span className="text-sm text-ink-secondary">/mês</span>
                <p className="mt-0.5 text-xs text-ink-tertiary">valor sob consulta</p>
              </div>
              <ul className="mt-4 flex-1 space-y-2">
                {PROFISSIONAL.highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-ink-secondary">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={PROFISSIONAL.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface-hover hover:text-ink"
              >
                <img src="/whatsapp.svg" alt="" className="h-4 w-4" />
                Consultar plano
              </a>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-ink-secondary">
            Não foi possível carregar os planos.
          </p>
        )}
      </Dialog>

      <Dialog
        open={open && confirmPlan !== null}
        onClose={() => {
          if (!changeMutation.isPending) setConfirmPlan(null)
        }}
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmPlan(null)}
            disabled={changeMutation.isPending}
          >
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
    </>
  )
}
