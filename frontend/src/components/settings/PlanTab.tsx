import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Crown, UserCircle } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getPlan } from '../../api/establishment'
import { cancelSubscription, getSubscription } from '../../api/payments'
import { formatTimestampBR } from '../../lib/format'
import { isInstallmentTermActive, isPeriodActive } from '../../lib/subscription'
import type { PlanFeatureKey, PlanInfo, Subscription } from '../../types/api'
import { PlanUpgradeDialog } from '../plan/PlanUpgradeDialog'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
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
  ['whatsapp', 'Confirmação e lembrete por WhatsApp'],
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

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando confirmação do pagamento',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  canceled: 'Cancelada',
}

/**
 * Texto do período pago. Compara a data com o presente: antes, "acesso pago
 * disponível até X" e "próxima cobrança em X" continuavam no presente mesmo
 * depois de X ter passado.
 */
function subscriptionPeriodLabel(subscription: Subscription): string | null {
  const end = subscription.currentPeriodEnd
  if (!end) return null
  const date = formatTimestampBR(end)
  const ended = !isPeriodActive(subscription)

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
  const toast = useToast()
  const queryClient = useQueryClient()

  const planQuery = useQuery({ queryKey: ['plan'], queryFn: getPlan })
  const subscriptionQuery = useQuery({ queryKey: ['payments', 'subscription'], queryFn: getSubscription })

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

  const access = planQuery.data
  const trialDaysLeft = access?.trialDaysLeft ?? 0

  const subscription = subscriptionQuery.data?.subscription ?? null
  const hadSubscription = subscription !== null

  const planLabel = access ? planBadgeLabel(access, hadSubscription) : null

  // Recursos exibidos abaixo do badge: o que a conta TEM agora, derivado do
  // payload. Em trial_expired (travada) e free (sem assinatura) não há lista de
  // benefícios a exibir: o aviso logo abaixo explica o estado.
  const planFeaturesList =
    access && (access.state === 'paid' || access.state === 'trial')
      ? currentPlanFeatures(access)
      : null
  // Exige também acesso pago vigente: quando o período vence, o registro ainda
  // pode chegar como 'active' de /payments/subscription enquanto o motor de
  // acesso já o encerrou, e o cancelamento então falharia com 404. O parcelado
  // com termo em aberto também não cancela (as parcelas já foram compradas).
  const canCancel =
    access?.state === 'paid' &&
    subscription !== null &&
    subscription.status !== 'canceled' &&
    !isInstallmentTermActive(subscription)

  const periodLabel = subscription ? subscriptionPeriodLabel(subscription) : null

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
            <Button type="button" onClick={() => setUpgradeOpen(true)}>
              {access?.state === 'paid' ? 'Mudar de plano' : 'Assinar um plano'}
            </Button>
          )}
        </div>
      </CardContent>

      <PlanUpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} />

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
