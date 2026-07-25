import { Clock, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../../hooks/usePlan'
import { cn } from '../../lib/format'
import { Button } from '../ui/Button'

const UPGRADE_PATH = '/app/configuracoes?tab=plano'

/**
 * Banner do teste grátis: contagem regressiva durante o teste e aviso de
 * somente-leitura quando expira. Renderiza `null` fora do teste (planos pagos).
 * `variant='sidebar'` é a versão compacta, último item da navegação (o
 * espaçamento vem do `space-y` do `nav` que a contém); `variant='page'` é a
 * versão destacada (topo do dashboard).
 */
export function TrialBanner({ variant = 'page' }: { variant?: 'page' | 'sidebar' }) {
  const navigate = useNavigate()
  const { data } = usePlan()

  if (!data || (data.state !== 'trial' && data.state !== 'trial_expired')) return null

  const expired = data.state === 'trial_expired'
  const days = data.trialDaysLeft ?? 0
  const dayLabel = `${days} ${days === 1 ? 'dia' : 'dias'}`
  const goUpgrade = () => navigate(UPGRADE_PATH)

  if (variant === 'sidebar') {
    return (
      <div className="rounded-lg bg-white/10 p-3">
        <div className="flex items-center gap-2 text-white">
          {expired ? <Lock className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
          <span className="text-xs font-semibold">
            {expired ? 'Teste encerrado' : `Teste grátis · ${dayLabel}`}
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-white/70">
          {expired ? 'Assine para voltar a editar.' : 'Tudo desbloqueado durante o teste.'}
        </p>
        <button
          type="button"
          onClick={goUpgrade}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-secondary/90"
        >
          {expired ? 'Assinar' : 'Fazer upgrade'}
        </button>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        expired ? 'border-error/30 bg-error-light' : 'border-secondary/40 bg-secondary-light',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            expired ? 'bg-error/15 text-error-dark' : 'bg-primary/10 text-primary',
          )}
        >
          {expired ? <Lock className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">
            {expired ? 'Seu teste grátis acabou' : `Teste grátis: faltam ${dayLabel}`}
          </p>
          <p className="text-[13px] text-ink-secondary">
            {expired
              ? 'Sua conta está em modo somente-leitura. Assine um plano para voltar a criar e editar.'
              : 'Você está com todos os recursos desbloqueados. Assine para continuar sem interrupção.'}
          </p>
        </div>
      </div>
      <Button onClick={goUpgrade} className="shrink-0">
        {expired ? 'Assinar agora' : 'Fazer upgrade'}
      </Button>
    </div>
  )
}
