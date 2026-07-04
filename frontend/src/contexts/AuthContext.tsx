import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import * as authApi from '../api/auth'
import type { RegisterPayload } from '../api/auth'
import { clearToken, getToken, setToken } from '../api/client'
import type { Establishment, User } from '../types/api'

interface AuthContextValue {
  user: User | null
  establishment: Establishment | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
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

  const setEstablishment = useCallback((value: Establishment) => {
    setEstablishmentState(value)
  }, [])

  const updateUser = useCallback((value: User) => {
    setUser(value)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        establishment,
        isLoading,
        isAuthenticated: Boolean(user),
        login,
        register,
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
