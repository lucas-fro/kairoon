import { Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { KairoonMark } from '../brand/Logo'
import { AccountMenu } from './AccountMenu'
import { NotificationsBell } from './NotificationsBell'

/**
 * Barra fina fixa no topo das páginas do painel. À direita: sino de
 * notificações e avatar da conta. No mobile, à esquerda, o botão de menu e a
 * marca (a sidebar desktop já mostra a marca).
 */
export function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { establishment } = useAuth()

  return (
    <header className="sticky top-0 z-20 border-b border-line-divider bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1760px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="rounded-lg p-2 text-ink-secondary transition-colors hover:bg-background lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <KairoonMark className="h-6 w-auto shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-ink">
              {establishment?.name ?? 'Kairoon'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <NotificationsBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
