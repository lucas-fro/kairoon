import { Crown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../../hooks/usePlan'

const UPGRADE_PATH = '/app/configuracoes?tab=plano'

/**
 * Chamada discreta para upgrade de plano. Só aparece para quem tem pra onde
 * subir dentro do checkout (free ou básico). Teste grátis e essencial (topo)
 * ficam de fora, pois já têm seus próprios avisos (TrialBanner) ou não
 * precisam. `variant='header'`: pílula compacta ao lado do sino (só desktop,
 * a barra do topo não tem espaço no celular). `variant='sidebar'`: cartão que
 * fecha a lista de navegação, depois de Configurações, usado só na versão
 * mobile (drawer). O espaçamento vem do `space-y` do `nav` que o contém.
 */
export function UpgradeBanner({ variant }: { variant: 'header' | 'sidebar' }) {
  const navigate = useNavigate()
  const { data } = usePlan()

  if (!data || (data.plan !== 'free' && data.plan !== 'basico')) return null

  const goUpgrade = () => navigate(UPGRADE_PATH)

  if (variant === 'sidebar') {
    return (
      <div className="rounded-lg bg-white/10 p-3">
        <div className="flex items-center gap-2 text-white">
          <Crown className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">Desbloqueie mais recursos</span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-white/70">
          Mais profissionais, relatórios e ferramentas pro seu negócio.
        </p>
        <button
          type="button"
          onClick={goUpgrade}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-secondary/90"
        >
          Fazer upgrade
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={goUpgrade}
      className="hidden shrink-0 items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary-light px-3 py-1.5 text-xs font-semibold text-primary transition-colors duration-150 hover:bg-secondary/20 lg:inline-flex"
    >
      <Crown className="h-3.5 w-3.5" />
      Fazer upgrade
    </button>
  )
}
