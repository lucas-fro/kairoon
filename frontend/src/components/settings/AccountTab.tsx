import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, KeyRound, Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from '../../api/auth'
import { ApiError } from '../../api/client'
import { deleteAccount } from '../../api/establishment'
import { useAuth } from '../../contexts/AuthContext'
import {
  dateBRToIso,
  formatCpf,
  formatPhone,
  isoToDateBR,
  isValidCpf,
  isValidPhone,
  maskDateBR,
  onlyDigits,
} from '../../lib/format'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Input'
import { useToast } from '../ui/Toast'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

export function AccountTab() {
  const { user, setUser, logout, isOwner } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(formatPhone(user?.phone ?? ''))
  const [birthDate, setBirthDate] = useState(isoToDateBR(user?.birthDate))
  const [cpf, setCpf] = useState(formatCpf(user?.cpf ?? ''))
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; cpf?: string }>({})

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      setUser(updated)
      toast.success('Dados pessoais atualizados!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      setConfirmOpen(false)
      logout()
      navigate('/login')
      toast.success('Sua conta foi excluída.')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    // A equipe só enxerga o cadastro; o backend recusaria a edição de qualquer jeito.
    if (!isOwner) return
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Informe seu nome'
    if (!EMAIL_REGEX.test(email.trim())) next.email = 'E-mail inválido'
    if (phone && !isValidPhone(phone)) next.phone = 'Telefone inválido'
    if (cpf && !isValidCpf(cpf)) next.cpf = 'CPF inválido'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    profileMutation.mutate({
      name: name.trim(),
      email: email.trim(),
      phone: onlyDigits(phone),
      birthDate: dateBRToIso(birthDate),
      cpf: cpf.trim(),
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{isOwner ? 'Dados do contratante' : 'Meus dados'}</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Para a equipe o cadastro é só consulta: quem corrige é o responsável. */}
          {!isOwner && (
            <p className="mb-4 text-sm text-ink-secondary">
              Seus dados cadastrais são atualizados pelo responsável pelo estabelecimento. Se algo
              estiver errado, peça a correção a ele.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
                disabled={!isOwner}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
                disabled={!isOwner}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Telefone"
                type="tel"
                inputMode="numeric"
                placeholder="(11) 98765-4321"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                error={errors.phone}
                disabled={!isOwner}
              />
              <Input
                label="Data de nascimento"
                inputMode="numeric"
                placeholder="DD/MM/AAAA"
                value={birthDate}
                onChange={(e) => setBirthDate(maskDateBR(e.target.value))}
                disabled={!isOwner}
              />
            </div>
            <Input
              label="CPF"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              error={errors.cpf}
              disabled={!isOwner}
            />
            {isOwner && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  isLoading={profileMutation.isPending}
                  leftIcon={<Save className="h-4 w-4" />}
                >
                  Salvar
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary-light text-primary">
                <KeyRound className="h-5 w-5" strokeWidth={1.9} />
              </div>
              <div className="min-w-0">
                <p className="font-display text-base font-semibold text-ink">Senha</p>
                <p className="mt-0.5 text-sm text-ink-secondary">
                  Troque sua senha com um código de confirmação enviado por e-mail, válido por 5
                  minutos.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/recuperar-senha', { state: { email: user?.email } })}
              className="shrink-0"
            >
              Redefinir senha
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Excluir a conta apaga o estabelecimento inteiro: só o dono vê isto. */}
      {isOwner && (
        <Card className="border border-error/30">
          <CardContent>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-error-light text-error-dark">
                  <AlertTriangle className="h-5 w-5" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold text-error-dark">
                    Zona de perigo
                  </p>
                  <p className="mt-0.5 text-sm text-ink-secondary">
                    Excluir sua conta remove permanentemente o estabelecimento, agendamentos,
                    clientes, serviços, funcionários e todo o histórico financeiro. Essa ação não
                    pode ser desfeita.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="danger"
                onClick={() => setConfirmOpen(true)}
                leftIcon={<Trash2 className="h-4 w-4" />}
                className="shrink-0"
              >
                Excluir conta
              </Button>
            </div>
          </CardContent>

          <ConfirmDialog
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            onConfirm={() => deleteMutation.mutate()}
            title="Excluir conta permanentemente?"
            description="Esta ação é irreversível. Todos os seus dados (agendamentos, clientes, serviços, funcionários e histórico financeiro) serão apagados definitivamente e você perderá o acesso ao seu link público."
            confirmLabel="Sim, excluir tudo"
            cancelLabel="Cancelar"
            danger
            isLoading={deleteMutation.isPending}
          />
        </Card>
      )}
    </div>
  )
}
