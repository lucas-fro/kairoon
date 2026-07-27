import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth'
import type { RegisterPayload } from '../api/auth'
import { clearToken, getToken, setToken } from '../api/client'
import type { AnyPermission } from '../lib/permissions'
import type { Establishment, User } from '../types/api'

interface AuthContextValue {
  user: User | null
  establishment: Establishment | null
  isLoading: boolean
  isAuthenticated: boolean
  /**
   * A sessão tem esta permissão? O dono passa em tudo. É SÓ UX: a regra que
   * vale é a do servidor, que rejeita a chamada de qualquer jeito.
   */
  can: (permission: AnyPermission) => boolean
  /** Dono da conta: plano, exclusão da conta e gestão de acessos são só dele. */
  isOwner: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  /** Entra direto com a sessão devolvida pelo aceite de convite. */
  adoptSession: (token: string, user: User, establishment: Establishment) => void
  logout: () => void
  /** Sincroniza o establishment no contexto após edições em Configurações */
  setEstablishment: (establishment: Establishment) => void
  /** Sincroniza os dados do contratante após edições na aba Conta */
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [establishment, setEstablishmentState] = useState<Establishment | null>(null)
  const [isLoading, setIsLoading] = useState(() => Boolean(getToken()))

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    authApi
      .getMe()
      .then((data) => {
        if (cancelled) return
        setUser(data.user)
        setEstablishmentState(data.establishment)
      })
      .catch(() => {
        if (!cancelled) clearToken()
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const handleLogout = () => {
      setUser(null)
      setEstablishmentState(null)
    }
    window.addEventListener('auth:logout', handleLogout)
    return () => window.removeEventListener('auth:logout', handleLogout)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password)
    setToken(data.token)
    setUser(data.user)
    setEstablishmentState(data.establishment)
  }, [])

  const register = useCallback(async (payload: RegisterPayload) => {
    const data = await authApi.register(payload)
    setToken(data.token)
    setUser(data.user)
    setEstablishmentState(data.establishment)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setEstablishmentState(null)
  }, [])

  const adoptSession = useCallback(
    (token: string, nextUser: User, nextEstablishment: Establishment) => {
      setToken(token)
      setUser(nextUser)
      setEstablishmentState(nextEstablishment)
    },
    [],
  )

  const setEstablishment = useCallback((value: Establishment) => {
    setEstablishmentState(value)
  }, [])

  const updateUser = useCallback((value: User) => {
    setUser(value)
  }, [])

  // Set em vez de array: `can` é chamado em toda renderização da navegação.
  const granted = useMemo(() => new Set(user?.permissions ?? []), [user])
  const can = useCallback(
    (permission: AnyPermission) => Boolean(user?.isOwner) || granted.has(permission),
    [granted, user],
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        establishment,
        isLoading,
        isAuthenticated: Boolean(user),
        can,
        isOwner: Boolean(user?.isOwner),
        login,
        register,
        adoptSession,
        logout,
        setEstablishment,
        setUser: updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
