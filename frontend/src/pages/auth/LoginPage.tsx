import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Aviso de sucesso ao voltar da recuperação de senha.
  const resetSuccess = Boolean((location.state as { resetSuccess?: boolean } | null)?.resetSuccess)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/app" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError('Informe e-mail e senha para entrar.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await login(trimmedEmail, password)
      navigate('/app')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado')
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <h1 className="font-display text-2xl font-semibold text-ink">Bem-vindo de volta</h1>
      <p className="mt-1.5 text-sm text-ink-secondary">Entre para gerenciar sua agenda.</p>

      {resetSuccess && (
        <div
          role="status"
          className="mt-6 flex items-start gap-2 rounded-lg bg-success-light px-3 py-2.5 text-sm text-success-dark"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Senha redefinida com sucesso! Entre com a nova senha.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4" noValidate>
        <Input
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@exemplo.com"
          leftIcon={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div>
          <div className="relative">
            <Input
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Sua senha"
              leftIcon={<Lock className="h-4 w-4" />}
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-0 top-7 flex h-10 w-10 items-center justify-center text-ink-tertiary transition-colors duration-150 hover:text-ink-secondary"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-1.5 text-right">
            <Link
              to="/recuperar-senha"
              className="text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" size="lg" className="w-full" isLoading={isSubmitting}>
          Entrar
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-secondary">
        Ainda não tem conta?{' '}
        <Link
          to="/register"
          className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
        >
          Criar conta grátis
        </Link>
      </p>
    </AuthShell>
  )
}
