import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptInvite, getInvite } from '../../api/access'
import { ApiError } from '../../api/client'
import { AuthShell } from '../../components/auth/AuthShell'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { useAuth } from '../../contexts/AuthContext'

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/**
 * Aceite do convite de acesso. O funcionário chega pelo link do e-mail: nome e
 * e-mail já foram cadastrados pelo dono, então aqui ele só cria a senha. No
 * sucesso já entra logado, sem passar pela tela de login.
 */
export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { adoptSession } = useAuth()
  const token = searchParams.get('t') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inviteQuery = useQuery({
    queryKey: ['invite', token],
    queryFn: () => getInvite(token),
    enabled: token.length > 0,
    retry: false,
  })

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvite(token, password),
    onSuccess: (data) => {
      adoptSession(data.token, data.user, data.establishment)
      navigate('/app', { replace: true })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem')
      return
    }
    acceptMutation.mutate()
  }

  // Link inválido, expirado, revogado ou já usado chegam todos aqui: a mesma
  // mensagem para todos, porque quem só tem o link não precisa saber a diferença.
  if (!token || inviteQuery.isError) {
    return (
      <AuthShell>
        <div className="text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-error" />
          <h1 className="mt-4 font-display text-xl font-bold text-ink">Convite indisponível</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Este convite não é mais válido. Ele pode ter expirado, sido cancelado ou já ter sido
            usado. Peça um novo convite para o responsável pelo estabelecimento.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block text-sm font-semibold text-primary hover:underline"
          >
            Ir para o login
          </Link>
        </div>
      </AuthShell>
    )
  }

  if (inviteQuery.isPending) return <PageLoader />

  const invite = inviteQuery.data

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-primary" />
        <h1 className="mt-3 font-display text-xl font-bold text-ink">
          Olá, {invite.name.split(' ')[0]}!
        </h1>
        <p className="mt-2 text-sm text-ink-secondary">
          A <strong className="text-ink">{invite.establishmentName}</strong> liberou seu acesso ao
          painel. Crie uma senha para entrar com o e-mail{' '}
          <strong className="text-ink">{invite.email}</strong>.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Criar senha"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo de 6 caracteres"
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="text-ink-muted hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <Input
          label="Confirmar senha"
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repita a senha"
          autoComplete="new-password"
          leftIcon={<Lock className="h-4 w-4" />}
        />

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-error/10 p-3 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" isLoading={acceptMutation.isPending}>
          Criar senha e entrar
        </Button>

        <p className="text-center text-xs text-ink-muted">
          Ao continuar você aceita os{' '}
          <Link to="/termos-de-uso" className="font-medium text-primary hover:underline">
            Termos de Uso
          </Link>{' '}
          e a{' '}
          <Link to="/politica-de-privacidade" className="font-medium text-primary hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  )
}
