import { useEffect, useState } from 'react'
import { Timer } from 'lucide-react'
import type { BillingCycle, Promo } from '../../types/api'
import { endOfLocalDay, formatCountdown, promoScopeLabel } from '../../lib/promo'

/**
 * Chamada da campanha promocional no topo do diálogo de escolha de plano.
 *
 * Precisa ficar DENTRO do `<Dialog>`: ele devolve null antes de renderizar os
 * filhos quando está fechado, e é isso que desmonta este componente e mata o
 * intervalo. Montado fora, o cronômetro rodaria 24/7 em toda tela do painel, e
 * em triplicata, porque o PlanUpgradeDialog está montado ao mesmo tempo no
 * PlanTab, no UpgradeBanner e no TrialBanner.
 *
 * Quem decide se a promo aparece é o pai (ver isPromoEligible): aqui só desenha.
 */
export function PromoBanner({
  promo,
  billingCycle,
}: {
  promo: Promo
  /** Ciclo selecionado: muda o que o desconto significa, então muda a copy. */
  billingCycle: BillingCycle
}) {
  const [remaining, setRemaining] = useState(() => endOfLocalDay().getTime() - Date.now())

  useEffect(() => {
    // O alvo é recalculado a cada tick (endOfLocalDay), nunca capturado no
    // mount: assim o contador vira o dia sozinho em vez de travar em zero.
    const tick = () => setRemaining(endOfLocalDay().getTime() - Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warning/40 bg-warning-light px-4 py-3">
      <Timer className="h-4 w-4 shrink-0 text-warning-dark" />
      <p className="flex-1 text-[13px] leading-snug text-warning-dark">
        {/* Nunca só "-10%": no mensal o desconto vale uma cobrança, no anual
            vale o ano todo, e essa diferença precisa estar na frente do olho. */}
        Use o cupom <span className="font-bold">{promo.code}</span> e ganhe{' '}
        <span className="font-bold">{promo.percentOff}% de desconto</span>{' '}
        {promoScopeLabel(billingCycle)}.
      </p>
      <span className="shrink-0 rounded-full bg-warning-dark px-2.5 py-1 text-xs font-semibold tabular-nums text-white">
        {formatCountdown(remaining)}
      </span>
    </div>
  )
}
