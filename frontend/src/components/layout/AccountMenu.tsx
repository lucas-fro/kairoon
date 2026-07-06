import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useDropdown } from '../../hooks/useDropdown'

export function AccountMenu() {
  const { open, setOpen, ref } = useDropdown()
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const initial = user?.name?.charAt(0).toUpperCase() ?? 'U'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu da conta"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-divider bg-surface shadow-floating">
          <div className="flex items-center gap-3 border-b border-line-divider px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
              <p className="truncate text-xs text-ink-tertiary">{user?.email}</p>
            </div>
          </div>
          <div className="p-1">
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
