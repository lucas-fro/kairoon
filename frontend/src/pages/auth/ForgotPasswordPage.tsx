import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  requestPasswordReset,
  resetPassword,
  verifyPasswordResetCode,
} from '../../api/auth'
import { ApiError } from '../../api/client'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'

type Step = 'email' | 'code' | 'password'

const CODE_TTL_MS = 5 * 60 * 1000
const EMAIL_REGEX = /^\S+@\S+\.\S+$/

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/** Milissegundos restantes → 'mm:ss'. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function ForgotPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  // Vindo da aba Conta (usuário logado), o e-mail já é conhecido e pulamos o
  // primeiro passo, enviando o código automaticamente.
  const presetEmail = (location.state as { email?: string } | null)?.email ?? ''
  const autoRequested = useRef(false)

  const [step, setStep] = useState<Step>(presetEmail ? 'code' : 'email')
  const [email, setEmail] = useState(presetEmail)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)

  const requestMutation = useMutation({
    mutationFn: (value: string) => requestPasswordReset(value),
    onSuccess: () => {
      setStep('code')
      setExpiresAt(Date.now() + CODE_TTL_MS)
      setError(null)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const verifyMutation = useMutation({
    mutationFn: () => verifyPasswordResetCode(email, code),
    onSuccess: () => {
      setStep('password')
      setError(null)
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const resetMutation = useMutation({
    mutationFn: () => resetPassword(email, code, newPassword),
    onSuccess: () => {
      // Sai da sessão atual (se logado) e leva para o login com aviso de sucesso.
      logout()
      navigate('/login', { replace: true, state: { resetSuccess: true } })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  // Entrada logada: dispara o envio do código uma única vez ao montar.
  useEffect(() => {
    if (presetEmail && !autoRequested.current) {
      autoRequested.current = true
      requestMutation.mutate(presetEmail)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Contagem regressiva de validade do código.
  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => setRemaining(expiresAt - Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  const expired = expiresAt !== null && remaining <= 0

  function handleRequest(event: FormEvent) {
    event.preventDefault()
    if (!EMAIL_REGEX.test(email.trim())) {
      setError('Informe um e-mail válido.')
      return
    }
    setError(null)
    requestMutation.mutate(email.trim())
  }

  function handleVerify(event: FormEvent) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError('Informe o código de 6 dígitos.')
      return
    }
    if (expired) {
      setError('O código expirou. Reenvie um novo.')
      return
    }
    setError(null)
    verifyMutation.mutate()
  }

  function handleReset(event: FormEvent) {
    event.preventDefault()
    if (newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.')
      return
    }
    if (confirmPassword !== newPassword) {
      setError('As senhas não conferem.')
      return
    }
    setError(null)
    resetMutation.mutate()
  }

  const errorBanner = error && (
    <div
      role="alert"
      className="mt-4 flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error}</span>
    </div>
  )

  return (
    <AuthShell>
      <button
        type="button"
        onClick={() => {
          setError(null)
          if (step === 'email') navigate('/login')
          else setStep('email')
        }}
        className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-ink-secondary transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        {step === 'email' ? 'Voltar ao login' : 'Usar outro e-mail'}
      </button>

      {step === 'email' && (
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Recuperar senha</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Informe o e-mail da sua conta e enviaremos um código de 6 dígitos para redefinir a
            senha.
          </p>
          <form onSubmit={handleRequest} className="mt-8 space-y-4" noValidate>
            <Input
              label="E-mail"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com"
              leftIcon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            {errorBanner}
            <Button type="submit" size="lg" className="w-full" isLoading={requestMutation.isPending}>
              Enviar código
            </Button>
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Confirme o código</h1>
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-background p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-secondary" strokeWidth={1.9} />
            <p className="text-sm text-ink-secondary">
              Enviamos um código para <strong className="text-ink">{email}</strong>.
              {expired ? (
                <span className="font-medium text-error-dark"> O código expirou, reenvie abaixo.</span>
              ) : expiresAt !== null ? (
                <>
                  {' '}
                  Expira em{' '}
                  <strong className="tabular-nums text-ink">{formatCountdown(remaining)}</strong>.
                </>
              ) : null}
            </p>
          </div>
          <form onSubmit={handleVerify} className="mt-6 space-y-4" noValidate>
            <Input
              label="Código de confirmação"
              inputMode="numeric"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-lg tracking-[0.4em]"
              autoFocus
            />
            {errorBanner}
            <Button type="submit" size="lg" className="w-full" isLoading={verifyMutation.isPending}>
              Validar código
            </Button>
            <button
              type="button"
              onClick={() => requestMutation.mutate(email)}
              disabled={requestMutation.isPending}
              className="w-full text-center text-sm font-medium text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Reenviando…' : 'Reenviar código'}
            </button>
          </form>
        </>
      )}

      {step === 'password' && (
        <>
          <h1 className="font-display text-2xl font-semibold text-ink">Nova senha</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Código confirmado. Defina a nova senha da sua conta.
          </p>
          <form onSubmit={handleReset} className="mt-8 space-y-4" noValidate>
            <div className="relative">
              <Input
                label="Nova senha"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Mínimo de 6 caracteres"
                leftIcon={<Lock className="h-4 w-4" />}
                className="pr-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-0 top-7 flex h-10 w-10 items-center justify-center text-ink-tertiary transition-colors hover:text-ink-secondary"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input
              label="Confirmar nova senha"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              leftIcon={<Lock className="h-4 w-4" />}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {errorBanner}
            <Button type="submit" size="lg" className="w-full" isLoading={resetMutation.isPending}>
              Redefinir senha
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}
