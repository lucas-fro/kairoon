import { useEffect, useState } from 'react'
import {
  BarChart3,
  Boxes,
  Cake,
  Calendar,
  ChevronDown,
  Clock,
  Coins,
  Crown,
  Gift,
  LayoutDashboard,
  List,
  Lock,
  Megaphone,
  Palette,
  Scissors,
  Settings,
  Stamp,
  Store,
  Ticket,
  UserCircle,
  UserCog,
  Users,
  UserX,
  Wallet,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { HeaderSlotProvider } from '../../contexts/HeaderSlotContext'
import { usePlan } from '../../hooks/usePlan'
import { cn } from '../../lib/format'
import type { PlanFeatureKey } from '../../types/api'
import { KairoonMark } from '../brand/Logo'
import { TrialBanner } from '../plan/TrialBanner'
import { TrialExpiredListener } from '../plan/TrialExpiredListener'
import { PendingBookingsListener } from '../realtime/PendingBookingsListener'
import { PaletteThemeApplier } from '../theme/PaletteThemeApplier'
import { AppHeader } from './AppHeader'

/** Item de navegação simples (link direto). */
type NavLeaf = { to: string; label: string; icon: LucideIcon; end?: boolean; feature?: PlanFeatureKey }

/** Sub-opção de um dropdown — navega para `${parent.to}?tab=${tab}`. */
type NavSubItem = { tab: string; label: string; icon: LucideIcon; feature?: PlanFeatureKey }

/** Item de navegação com sub-opções (dropdown que expande na própria sidebar). */
type NavParent = {
  to: string
  label: string
  icon: LucideIcon
  feature?: PlanFeatureKey
  defaultTab: string
  children: NavSubItem[]
}

type NavEntry = NavLeaf | NavParent

function isParent(entry: NavEntry): entry is NavParent {
  return 'children' in entry
}

const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Principal',
    items: [
      { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/app/agenda', label: 'Agenda', icon: Calendar },
    ],
  },
  {
    label: 'Gestão',
    items: [
      {
        to: '/app/clientes',
        label: 'Clientes',
        icon: Users,
        defaultTab: 'listagem',
        children: [
          { tab: 'listagem', label: 'Listagem', icon: List },
          { tab: 'aniversarios', label: 'Aniversários', icon: Cake, feature: 'clientes_crm' },
          { tab: 'sumidos', label: 'Sumidos', icon: UserX, feature: 'clientes_crm' },
        ],
      },
      { to: '/app/servicos', label: 'Serviços', icon: Scissors },
      { to: '/app/funcionarios', label: 'Profissionais', icon: UserCircle },
      {
        to: '/app/fidelidade',
        label: 'Fidelidade',
        icon: Gift,
        feature: 'fidelidade',
        defaultTab: 'cartao',
        children: [
          { tab: 'cupons', label: 'Cupons', icon: Ticket, feature: 'cupons' },
          { tab: 'campanhas', label: 'Campanhas', icon: Megaphone, feature: 'cupons' },
          { tab: 'cartao', label: 'Cartão fidelidade', icon: Stamp, feature: 'fidelidade' },
          { tab: 'pontos', label: 'Pontos', icon: Coins, feature: 'fidelidade' },
        ],
      },
      { to: '/app/estoque', label: 'Estoque', icon: Boxes, feature: 'estoque' },
      { to: '/app/financeiro', label: 'Financeiro', icon: Wallet, feature: 'financeiro' },
      { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3, feature: 'relatorios' },
    ],
  },
  {
    label: 'Sistema',
    items: [
      {
        to: '/app/configuracoes',
        label: 'Configurações',
        icon: Settings,
        defaultTab: 'estabelecimento',
        children: [
          { tab: 'estabelecimento', label: 'Estabelecimento', icon: Store },
          { tab: 'funcionamento', label: 'Expediente', icon: Clock },
          { tab: 'aparencia', label: 'Aparência', icon: Palette },
          { tab: 'plano', label: 'Plano', icon: Crown },
          { tab: 'conta', label: 'Conta', icon: UserCog },
        ],
      },
    ],
  },
]

/** Recurso trancado pelo plano atual (mostra o cadeado). */
type FeatureLocked = (feature?: PlanFeatureKey) => boolean

function LeafNav({
  item,
  featureLocked,
  onNavigate,
}: {
  item: NavLeaf
  featureLocked: FeatureLocked
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
          // Texto sempre branco cheio: com paletas coloridas (primary ~5:1 no
          // branco) qualquer opacidade no texto quebra o contraste AA. O estado
          // ativo é sinalizado pelo realce (bg-white/10) + a barra indicadora.
          isActive ? 'bg-white/10 text-white' : 'text-white hover:bg-white/10',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute -left-4 h-5 w-[3px] rounded-r bg-secondary" />}
          <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
          <span className="flex-1 truncate">{item.label}</span>
          {featureLocked(item.feature) && <Lock className="h-3.5 w-3.5 shrink-0 text-white/40" />}
        </>
      )}
    </NavLink>
  )
}

function ParentNav({
  item,
  featureLocked,
  open,
  sectionActive,
  currentTab,
  onToggle,
  onNavigate,
}: {
  item: NavParent
  featureLocked: FeatureLocked
  open: boolean
  sectionActive: boolean
  currentTab: string | null
  onToggle: () => void
  onNavigate?: () => void
}) {
  // Aba efetiva quando esta seção está ativa (usada para destacar a sub-opção).
  const activeTab = currentTab && item.children.some((c) => c.tab === currentTab) ? currentTab : item.defaultTab

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
          // Seção ativa recebe um realce sutil; a sub-opção ativa é o destaque forte.
          sectionActive ? 'bg-white/5 text-white' : 'text-white hover:bg-white/10',
        )}
      >
        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.9} />
        <span className="flex-1 truncate text-left">{item.label}</span>
        {featureLocked(item.feature) && <Lock className="h-3.5 w-3.5 shrink-0 text-white/40" />}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-white/50 transition-transform duration-200',
            open && 'rotate-180',
          )}
          strokeWidth={2}
        />
      </button>

      {/* Expansão suave (grid-rows 0fr→1fr anima a altura sem valor fixo). */}
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!open}
      >
        <div className="overflow-hidden">
          <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-white/10 pl-3">
            {item.children.map((sub) => {
              const isActive = sectionActive && activeTab === sub.tab
              return (
                <Link
                  key={sub.tab}
                  to={`${item.to}?tab=${sub.tab}`}
                  onClick={onNavigate}
                  tabIndex={open ? undefined : -1}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors duration-150',
                    isActive
                      ? 'bg-white/10 font-medium text-white'
                      : 'text-white hover:bg-white/5',
                  )}
                >
                  <sub.icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                  <span className="flex-1 truncate">{sub.label}</span>
                  {featureLocked(sub.feature) && <Lock className="h-3 w-3 shrink-0 text-white/40" />}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { establishment } = useAuth()
  const { data: plan } = usePlan()
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const featureLocked: FeatureLocked = (feature) => !!feature && !!plan && !plan.features[feature]

  // Parent (dropdown) da rota atual — mantém a seção aberta ao navegar/deep-link.
  const activeParentTo =
    NAV_GROUPS.flatMap((group) => group.items).find(
      (item): item is NavParent => isParent(item) && location.pathname.startsWith(item.to),
    )?.to ?? null

  const [openTo, setOpenTo] = useState<string | null>(activeParentTo)
  useEffect(() => {
    if (activeParentTo) setOpenTo(activeParentTo)
  }, [activeParentTo])

  const currentTab = searchParams.get('tab')

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex h-14 items-center gap-3 px-2">
        <KairoonMark className="h-8 w-auto shrink-0 text-white" />
        <div className="min-w-0">
          <p className="font-display text-[17px] font-bold leading-tight text-white">Kairoon</p>
          <p className="truncate text-xs text-white">
            {establishment?.name ?? 'Agendamentos'}
          </p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-xs font-medium text-white/40">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) =>
                isParent(item) ? (
                  <ParentNav
                    key={item.to}
                    item={item}
                    featureLocked={featureLocked}
                    open={openTo === item.to}
                    sectionActive={location.pathname.startsWith(item.to)}
                    currentTab={currentTab}
                    onToggle={() => setOpenTo((prev) => (prev === item.to ? null : item.to))}
                    onNavigate={onNavigate}
                  />
                ) : (
                  <LeafNav key={item.to} item={item} featureLocked={featureLocked} onNavigate={onNavigate} />
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Rodapé: banner do teste grátis (some fora do teste). */}
      <TrialBanner variant="sidebar" />
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[240px] bg-primary lg:block">
        <SidebarContent />
      </aside>

      {/* Drawer mobile — sempre montado para animar entrada/saída */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            'absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-200 ease-out',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 w-[280px] max-w-[85vw] bg-primary shadow-floating',
            'transition-transform duration-200 ease-out',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="absolute right-3 top-5 z-10 rounded-lg p-1.5 text-white/70 hover:bg-white/10"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Coluna de conteúdo (deslocada pela sidebar no desktop) */}
      <div className="lg:ml-[240px]">
        <HeaderSlotProvider>
          <AppHeader onOpenMenu={() => setMobileOpen(true)} />
          <main className="isolate w-full px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
            <Outlet />
          </main>
        </HeaderSlotProvider>
      </div>

      {/* Aplica a paleta de cores escolhida em todo o painel */}
      <PaletteThemeApplier />

      {/* Popup em tempo real de agendamentos pendentes do link público */}
      <PendingBookingsListener />

      {/* Convite de upgrade quando uma escrita é bloqueada (teste expirado). */}
      <TrialExpiredListener />
    </div>
  )
}
