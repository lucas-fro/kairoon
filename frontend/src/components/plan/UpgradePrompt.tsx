import { Lock, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/format'
import { Button } from '../ui/Button'

interface UpgradePromptProps {
  /** Plano mínimo que libera o recurso (ex.: 'Essencial'). */
  plan: string
  /** Versão enxuta, para caber dentro de um card menor (relatórios, aparência). */
  compact?: boolean
  className?: string
}

/**
 * Mensagem genérica de "recurso bloqueado no seu plano" + botão de upgrade.
 * Fonte ÚNICA do visual de gating em toda a app (FeatureGate, relatórios
 * avançados, aparência, limite de equipe). Sempre leva a Configurações › Plano.
 */
export function UpgradePrompt({ plan, compact, className }: UpgradePromptProps) {
  const navigate = useNavigate()
  const goToPlans = () => navigate('/app/configuracoes?tab=plano')

  const message = 'Para acessar este recurso e muito mais, faça upgrade no seu plano.'

  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2.5 px-4 py-6 text-center',
          className,
        )}
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary-light">
          <Lock className="h-5 w-5 text-primary" />
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">Plano {plan}</p>
        <p className="max-w-xs text-sm text-ink-secondary">{message}</p>
        <Button
          size="sm"
          variant="outline"
          leftIcon={<Sparkles className="h-4 w-4" />}
          onClick={goToPlans}
        >
          Fazer upgrade
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('w-full py-6', className)}>
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-card">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary-light">
          <Lock className="h-6 w-6 text-primary" />
        </span>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-primary">
          Plano {plan}
        </p>
        <h2 className="mt-1 font-display text-xl font-semibold text-ink">Recurso do plano {plan}</h2>
        <p className="mt-2 max-w-sm text-sm text-ink-secondary">{message}</p>
        <Button className="mt-6" onClick={goToPlans} leftIcon={<Sparkles className="h-4 w-4" />}>
          Fazer upgrade
        </Button>
      </div>
    </div>
  )
}
