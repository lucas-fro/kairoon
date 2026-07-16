import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { KairoonLogotype } from '../../components/brand/Logo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'

export function LoginPage() {
  const { isAuthenticated, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to={from ?? '/app'} replace />

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
      navigate(from ?? '/app')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca com foto — visível em telas grandes */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2 xl:w-[55%]">
        <img
          src="/imgTelaLogin.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Camadas navy para legibilidade do texto sobre a foto */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/80 to-primary/45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-transparent" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <KairoonLogotype className="h-24 w-auto text-white" />

          <div className="max-w-lg">
            <h2 className="font-display text-4xl font-bold leading-[1.15] text-white xl:text-[2.75rem]">
              A plataforma que transforma tempo em crescimento.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/80">
              Centralize agendamentos, operação, clientes e gestão em um único sistema para sua
              empresa operar com mais precisão, controle e previsibilidade.
            </p>
          </div>

          <p className="text-sm font-medium tracking-wide text-white/70">
            Precisão no tempo. Direção no crescimento.
          </p>
        </div>
      </aside>

      {/* Painel do formulário */}
      <div className="relative flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2 lg:bg-background xl:w-[45%]">
        {/* Fundo com foto + filtro navy — só no mobile */}
        <img
          src="/imgTelaLogin.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover lg:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/85 to-primary/70 lg:hidden" />

        {/* Logo sobre o fundo — só no mobile */}
        <KairoonLogotype className="relative z-10 mb-8 h-14 w-auto text-white lg:hidden" />

        {/* Card do form — branco com sombra flutuante em todas as telas */}
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-floating sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-ink">Bem-vindo de volta</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">Entre para gerenciar sua agenda.</p>

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

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark">
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
              state={location.state}
              className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
            >
              Criar conta grátis
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
