import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Save, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { updateProfile } from '../../api/auth'
import { ApiError } from '../../api/client'
import { deleteAccount } from '../../api/establishment'
import { useAuth } from '../../contexts/AuthContext'
import { formatCpf, formatPhone, isValidCpf, isValidPhone, onlyDigits } from '../../lib/format'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Input } from '../ui/Input'
import { useToast } from '../ui/Toast'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

export function AccountTab() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [phone, setPhone] = useState(formatPhone(user?.phone ?? ''))
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? '')
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
      birthDate,
      cpf: cpf.trim(),
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Dados do contratante</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nome completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
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
              />
              <Input
                label="Data de nascimento"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <Input
              label="CPF"
              inputMode="numeric"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpf(e.target.value))}
              error={errors.cpf}
            />
            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                isLoading={profileMutation.isPending}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Salvar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-error-dark">Zona de perigo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-secondary">
            Excluir sua conta remove permanentemente o estabelecimento, agendamentos, clientes,
            serviços, funcionários e todo o histórico financeiro. Essa ação não pode ser desfeita.
          </p>
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmOpen(true)}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              Excluir conta e todos os dados
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
    </div>
  )
}
