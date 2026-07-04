import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Cake, Mail, Phone, User } from 'lucide-react'
import { identifyClient } from '../../api/public'
import { formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

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
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [email, setEmail] = useState(initialEmail)
  const [birthDate, setBirthDate] = useState(initialBirthDate)
  const [gender, setGender] = useState(initialGender)
  const [phoneTouched, setPhoneTouched] = useState(false)
  const [greetingName, setGreetingName] = useState<string | null>(null)
  const toast = useToast()

  const lastIdentifiedRef = useRef<string | null>(null)
  const autoFilledNameRef = useRef<string | null>(null)

  const digits = onlyDigits(phone)
  const phoneValid = isValidPhone(phone)
  const nameValid = name.trim().length >= 2
  const emailValid = email.trim() === '' || EMAIL_REGEX.test(email.trim())
  const showPhoneError = phoneTouched && phone.length > 0 && !phoneValid

  // Identifica o cliente pelo telefone (com debounce) para preencher o nome
  useEffect(() => {
    if (digits.length < 10 || digits === lastIdentifiedRef.current) return

    let active = true
    const timer = setTimeout(async () => {
      try {
        const { client } = await identifyClient(slug, digits)
        if (!active) return
        lastIdentifiedRef.current = digits
        if (client) {
          setGreetingName(client.name.split(' ')[0])
          setName((current) => {
            if (current.trim() === '' || current === autoFilledNameRef.current) {
              autoFilledNameRef.current = client.name
              return client.name
            }
            return current
          })
        } else {
          setGreetingName(null)
        }
      } catch {
        // Identificação é apenas conveniência — falha silenciosa
      }
    }, 500)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [digits, slug])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!nameValid || !phoneValid || !emailValid) return
    if (greetingName) toast.info(`Que bom te ver de novo, ${greetingName}!`)
    onContinue(name.trim(), phone, email.trim(), birthDate, gender)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
      <Input
        label="Nome"
        autoComplete="name"
        placeholder="Seu nome completo"
        leftIcon={<User className="h-4 w-4" />}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <Input
        label="Telefone / WhatsApp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(11) 98765-4321"
        leftIcon={<Phone className="h-4 w-4" />}
        value={phone}
        onChange={(e) => setPhone(formatPhone(e.target.value))}
        onBlur={() => setPhoneTouched(true)}
        error={showPhoneError ? 'Informe um telefone válido com DDD' : undefined}
        hint="Necessário para receber confirmações e avisos"
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
          type="date"
          leftIcon={<Cake className="h-4 w-4" />}
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <Select label="Sexo (opcional)" value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">Não informar</option>
          <option value="masculino">Masculino</option>
          <option value="feminino">Feminino</option>
          <option value="outro">Outro</option>
        </Select>
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
