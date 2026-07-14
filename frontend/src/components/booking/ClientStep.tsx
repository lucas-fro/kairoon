import { useState } from 'react'
import type { FormEvent } from 'react'
import { Cake, Mail, Pencil, Phone, User } from 'lucide-react'
import { identifyClient } from '../../api/public'
import {
  dateBRToIso,
  formatPhone,
  isoToDateBR,
  isValidPhone,
  maskDateBR,
  onlyDigits,
} from '../../lib/format'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import type { SelectMenuOption } from '../ui/SelectMenu'
import { useToast } from '../ui/Toast'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

const GENDER_OPTIONS: SelectMenuOption[] = [
  { value: '', label: 'Não informar' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
]

type Phase = 'phone' | 'details'

interface ClientStepProps {
  slug: string
  initialName: string
  initialPhone: string
  initialEmail: string
  initialBirthDate: string
  initialGender: string
  onContinue: (
    name: string,
    phone: string,
    email: string,
    birthDate: string,
    gender: string,
  ) => void
}

export function ClientStep({
  slug,
  initialName,
  initialPhone,
  initialEmail,
  initialBirthDate,
  initialGender,
  onContinue,
}: ClientStepProps) {
  const [phase, setPhase] = useState<Phase>('phone')
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [email, setEmail] = useState(initialEmail)
  const [birthDate, setBirthDate] = useState(isoToDateBR(initialBirthDate))
  const [gender, setGender] = useState(initialGender)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [checking, setChecking] = useState(false)
  const toast = useToast()

  const digits = onlyDigits(phone)
  const phoneValid = isValidPhone(phone)
  const nameValid = name.trim().length >= 2
  const emailValid = email.trim() === '' || EMAIL_REGEX.test(email.trim())
  const showPhoneError = phoneTouched && phone.length > 0 && !phoneValid

  // Etapa 1: pede só o telefone e checa se o cliente já existe. Se sim, vai
  // direto para a confirmação; se não, abre o formulário de cadastro.
  async function handleCheckPhone(event: FormEvent) {
    event.preventDefault()
    if (!phoneValid) {
      setPhoneTouched(true)
      return
    }
    setChecking(true)
    try {
      const { client } = await identifyClient(slug, digits)
      if (client) {
        toast.info(`Que bom te ver de novo, ${client.name.split(' ')[0]}!`)
        onContinue(client.name, phone, '', '', '')
        return
      }
      setPhase('details')
    } catch {
      // Falha na checagem não bloqueia o agendamento: trata como cliente novo.
      setPhase('details')
    } finally {
      setChecking(false)
    }
  }

  // Etapa 2 (cliente novo): completa os dados e segue para a confirmação.
  function handleSubmitDetails(event: FormEvent) {
    event.preventDefault()
    if (!nameValid || !phoneValid || !emailValid) return
    onContinue(name.trim(), phone, email.trim(), dateBRToIso(birthDate), gender)
  }

  if (phase === 'phone') {
    return (
      <form onSubmit={handleCheckPhone} className="flex flex-1 flex-col gap-4">
        <Input
          label="Telefone / WhatsApp"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="(11) 98765-4321"
          leftIcon={<Phone className="h-4 w-4" />}
          value={phone}
          onChange={(e) => setPhone(formatPhone(e.target.value))}
          onBlur={() => setPhoneTouched(true)}
          error={showPhoneError ? 'Informe um telefone válido com DDD' : undefined}
          hint="Vamos usar para confirmar seu cadastro e enviar avisos"
        />

        <div className="mt-auto pt-4">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            isLoading={checking}
            disabled={!phoneValid}
          >
            Continuar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={handleSubmitDetails} className="flex flex-1 flex-col gap-4">
      <div className="rounded-lg bg-secondary-light/40 px-4 py-3 text-sm text-ink-secondary">
        Seu primeiro agendamento aqui! Complete seus dados para confirmar.
      </div>

      {/* Telefone já informado, com opção de alterar */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-background px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-xs text-ink-tertiary">Telefone</p>
          <p className="truncate text-sm font-medium text-ink">{formatPhone(phone)}</p>
        </div>
        <button
          type="button"
          onClick={() => setPhase('phone')}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-primary transition-colors hover:bg-surface"
        >
          <Pencil className="h-3.5 w-3.5" />
          Alterar
        </button>
      </div>

      <Input
        label="Nome"
        autoComplete="name"
        autoFocus
        placeholder="Seu nome completo"
        leftIcon={<User className="h-4 w-4" />}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Input
        label="E-mail (opcional)"
        type="email"
        autoComplete="email"
        placeholder="voce@exemplo.com"
        leftIcon={<Mail className="h-4 w-4" />}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={email.trim() !== '' && !emailValid ? 'Informe um e-mail válido' : undefined}
        hint="Para receber confirmações e avisos por e-mail"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Nascimento (opcional)"
          inputMode="numeric"
          placeholder="DD/MM/AAAA"
          leftIcon={<Cake className="h-4 w-4" />}
          value={birthDate}
          onChange={(e) => setBirthDate(maskDateBR(e.target.value))}
        />
        <SelectMenu
          label="Sexo (opcional)"
          value={gender}
          onChange={setGender}
          options={GENDER_OPTIONS}
        />
      </div>

      <div className="mt-auto pt-4">
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={!nameValid || !phoneValid || !emailValid}
        >
          Continuar
        </Button>
      </div>
    </form>
  )
}
