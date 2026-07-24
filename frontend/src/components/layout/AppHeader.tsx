import { Menu } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useHeaderSlotContent } from '../../contexts/HeaderSlotContext'
import { KairoonMark } from '../brand/Logo'
import { UpgradeBanner } from '../plan/UpgradeBanner'
import { AccountMenu } from './AccountMenu'
import { NotificationsBell } from './NotificationsBell'

/**
 * Barra fina fixa no topo das páginas do painel. À direita: sino de
 * notificações e avatar da conta. No mobile, à esquerda, o botão de menu e a
 * marca (a sidebar desktop já mostra a marca).
 */
export function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { establishment } = useAuth()
  const slot = useHeaderSlotContent()

  return (
    <header className="sticky top-0 z-20 border-b border-line-divider bg-surface/85 backdrop-blur">
      <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            className="shrink-0 rounded-lg p-2 text-ink-secondary transition-colors hover:bg-background lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {slot ? (
            // Conteúdo injetado pela página (ex.: busca da Agenda) no canto esquerdo.
            <div className="min-w-0 flex-1 sm:max-w-sm">{slot}</div>
          ) : (
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <KairoonMark className="h-6 w-auto shrink-0 text-primary" />
              <span className="truncate text-sm font-semibold text-ink">
                {establishment?.name ?? 'Kairoon'}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <UpgradeBanner variant="header" />
          <NotificationsBell />
          <AccountMenu />
        </div>
      </div>
    </header>
  )
}
