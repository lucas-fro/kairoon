import { useState } from 'react'
import {
  BarChart3,
  Boxes,
  Calendar,
  Gift,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/format'
import { KairoonMark } from '../brand/Logo'
import { PendingBookingsListener } from '../realtime/PendingBookingsListener'
import { AppHeader } from './AppHeader'

const NAV_GROUPS = [
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
      { to: '/app/clientes', label: 'Clientes', icon: Users },
      { to: '/app/fidelidade', label: 'Fidelidade', icon: Gift },
      { to: '/app/estoque', label: 'Estoque', icon: Boxes },
      { to: '/app/financeiro', label: 'Financeiro', icon: Wallet },
      { to: '/app/relatorios', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'Sistema',
    items: [{ to: '/app/configuracoes', label: 'Configurações', icon: Settings }],
  },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { establishment } = useAuth()

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex h-14 items-center gap-3 px-2">
        <KairoonMark className="h-8 w-auto shrink-0 text-white" />
        <div className="min-w-0">
          <p className="font-display text-[17px] font-bold leading-tight text-white">Kairoon</p>
          <p className="truncate text-xs text-white/60">
            {establishment?.name ?? 'Agendamentos'}
          </p>
        </div>
      </div>

      <nav className="mt-4 flex-1 space-y-6 overflow-y-auto">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-xs font-medium text-white/40">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span className="absolute -left-4 h-5 w-[3px] rounded-r bg-secondary" />
                      )}
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                      {item.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
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
        <AppHeader onOpenMenu={() => setMobileOpen(true)} />
        <main className="isolate mx-auto max-w-[1760px] px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <Outlet />
        </main>
      </div>

      {/* Popup em tempo real de agendamentos pendentes do link público */}
      <PendingBookingsListener />
    </div>
  )
}
