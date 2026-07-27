import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { AnyPermission } from '../lib/permissions'

/**
 * Página que exige permissão. Sem ela, manda para o dashboard em vez de mostrar
 * um erro: a navegação já esconde o item, então cair aqui é link antigo,
 * favorito ou URL digitada, e nesses casos avisar "acesso negado" é ruído.
 *
 * O dashboard é sempre alcançável (rota 'authenticated' no servidor), então este
 * redirecionamento nunca entra em laço.
 */
export function PermissionRoute({
  permission,
  children,
}: {
  permission: AnyPermission
  children: ReactNode
}) {
  const { can } = useAuth()
  if (!can(permission)) return <Navigate to="/app" replace />
  return <>{children}</>
}
