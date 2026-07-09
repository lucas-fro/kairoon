import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, Mail, ShieldCheck } from 'lucide-react'
import { confirmPasswordReset, requestPasswordReset } from '../../api/auth'
import { ApiError } from '../../api/client'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { useToast } from '../ui/Toast'

const CODE_TTL_MS = 5 * 60 * 1000

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/** Segundos restantes → 'mm:ss'. */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

interface PasswordResetDialogProps {
  open: boolean
  onClose: () => void
  email: string
}

export function PasswordResetDialog({ open, onClose, email }: PasswordResetDialogProps) {
  const toast = useToast()
  const [step, setStep] = useState<'request' | 'confirm'>('request')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ code?: string; newPassword?: string; confirmPassword?: string }>({})
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [remaining, setRemaining] = useState(0)

  // Reinicia tudo ao abrir (sempre começa pelo pedido do código).
  useEffect(() => {
    if (open) {
      setStep('request')
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setErrors({})
      setExpiresAt(null)
    }
  }, [open])

  // Contagem regressiva de validade do código.
  useEffect(() => {
    if (expiresAt === null) return
    const tick = () => setRemaining(expiresAt - Date.now())
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  const requestMutation = useMutation({
    mutationFn: requestPasswordReset,
    onSuccess: () => {
      setStep('confirm')
      setExpiresAt(Date.now() + CODE_TTL_MS)
      toast.success('Código enviado para o seu e-mail.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const confirmMutation = useMutation({
    mutationFn: confirmPasswordReset,
    onSuccess: () => {
      toast.success('Senha redefinida com sucesso!')
      onClose()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const expired = expiresAt !== null && remaining <= 0

  function handleConfirm(event: FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!/^\d{6}$/.test(code)) next.code = 'Informe o código de 6 dígitos'
    if (newPassword.length < 6) next.newPassword = 'A senha deve ter no mínimo 6 caracteres'
    if (confirmPassword !== newPassword) next.confirmPassword = 'As senhas não conferem'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    confirmMutation.mutate({ code, newPassword })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Redefinir senha" maxWidth="max-w-md">
      {step === 'request' ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl bg-background p-4">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-secondary" strokeWidth={1.9} />
            <p className="text-sm text-ink-secondary">
              Vamos enviar um código de 6 dígitos para{' '}
              <strong className="text-ink">{email}</strong>. Ele vale por 5 minutos.
            </p>
          </div>
          <DialogActions>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => requestMutation.mutate()}
              isLoading={requestMutation.isPending}
            >
              Enviar código
            </Button>
          </DialogActions>
        </div>
      ) : (
        <form onSubmit={handleConfirm} className="space-y-4" noValidate>
          <div className="flex items-start gap-3 rounded-xl bg-background p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-secondary" strokeWidth={1.9} />
            <p className="text-sm text-ink-secondary">
              Enviamos um código para <strong className="text-ink">{email}</strong>.
              {expired ? (
                <span className="font-medium text-error-dark"> O código expirou, reenvie abaixo.</span>
              ) : (
                <>
                  {' '}
                  Expira em{' '}
                  <strong className="tabular-nums text-ink">{formatCountdown(remaining)}</strong>.
                </>
              )}
            </p>
          </div>

          <Input
            label="Código de confirmação"
            inputMode="numeric"
            placeholder="000000"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={errors.code}
            className="text-center text-lg tracking-[0.4em]"
          />

          <Input
            label="Nova senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="Mínimo de 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            error={errors.newPassword}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="text-ink-tertiary transition-colors hover:text-ink-secondary"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Input
            label="Confirmar nova senha"
            type={showPassword ? 'text' : 'password'}
            placeholder="Repita a nova senha"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
          />

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              className="text-sm font-medium text-primary transition-colors hover:text-primary-hover disabled:opacity-50"
            >
              {requestMutation.isPending ? 'Reenviando…' : 'Reenviar código'}
            </button>
          </div>

          <DialogActions className="pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" isLoading={confirmMutation.isPending}>
              Redefinir senha
            </Button>
          </DialogActions>
        </form>
      )}
    </Dialog>
  )
}
