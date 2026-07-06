import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Scissors,
  Smartphone,
  Sparkles,
  Store,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { checkSlugAvailability } from '../../api/auth'
import { ApiError } from '../../api/client'
import { KairoonLogotype } from '../../components/brand/Logo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import {
  cn,
  formatCep,
  formatCnpj,
  formatCpf,
  formatPhone,
  isValidCep,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  onlyDigits,
} from '../../lib/format'
import { fetchAddressByCep } from '../../lib/viacep'
import type { BusinessType } from '../../types/api'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const TOTAL_STEPS = 3

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Sua conta', subtitle: 'Comece criando seu acesso.' },
  2: { title: 'Seu negócio', subtitle: 'Conte um pouco sobre seu estabelecimento.' },
  3: { title: 'Só mais 30 segundos', subtitle: 'Nos conte sobre seu negócio.' },
}

/** Destaques exibidos no painel de marca durante o cadastro. */
const HIGHLIGHTS = [
  'Agenda online disponível 24 horas por dia',
  'Link público para os clientes agendarem sozinhos',
  'Gestão de equipe, comissões e relatórios',
]

const BUSINESS_TYPES: { value: BusinessType; label: string; icon: LucideIcon }[] = [
  { value: 'barbearia', label: 'Barbearia', icon: Scissors },
  { value: 'salao', label: 'Salão de Beleza', icon: Sparkles },
  { value: 'clinica', label: 'Clínica de Estética', icon: HeartPulse },
  { value: 'outro', label: 'Outro', icon: Store },
]

const QUIZ_QUESTIONS: {
  key: string
  label: string
  options: { value: string; label: string }[]
}[] = [
  {
    key: 'teamSize',
    label: 'Quantas pessoas atendem?',
    options: [
      { value: 'somente-eu', label: 'Somente eu' },
      { value: '2-a-5', label: '2 a 5 pessoas' },
      { value: '6-a-10', label: '6 a 10 pessoas' },
      { value: 'mais-de-10', label: 'Mais de 10' },
    ],
  },
  {
    key: 'monthlyClients',
    label: 'Clientes por mês?',
    options: [
      { value: 'ate-50', label: 'Até 50' },
      { value: '51-150', label: '51 a 150' },
      { value: '151-300', label: '151 a 300' },
      { value: 'mais-de-300', label: 'Mais de 300' },
    ],
  },
  {
    key: 'mainGoal',
    label: 'Principal objetivo?',
    options: [
      { value: 'organizar-agenda', label: 'Organizar a agenda' },
      { value: 'reduzir-faltas', label: 'Reduzir faltas' },
      { value: 'aumentar-faturamento', label: 'Aumentar o faturamento' },
      { value: 'fidelizar-clientes', label: 'Fidelizar clientes' },
    ],
  },
  {
    key: 'heardFrom',
    label: 'Como nos conheceu?',
    options: [
      { value: 'indicacao', label: 'Indicação' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'google', label: 'Google' },
      { value: 'outro', label: 'Outro' },
    ],
  },
]

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error'

/** minúsculas, sem acentos, espaços→hífen, só [a-z0-9-] */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface PasswordFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  placeholder?: string
  autoComplete?: string
}

function PasswordField({ label, value, onChange, error, hint, placeholder, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        label={label}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        hint={hint}
        placeholder={placeholder}
        autoComplete={autoComplete}
        leftIcon={<Lock className="h-4 w-4" />}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-0 top-7 flex h-10 w-10 items-center justify-center text-ink-tertiary transition-colors duration-150 hover:text-ink-secondary"
        aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}

function OptionCard({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors duration-150',
        selected
          ? 'border-secondary bg-secondary-light font-medium text-primary'
          : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary' : 'border-ink-disabled',
        )}
        aria-hidden="true"
      >
        {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
      </span>
      {label}
    </button>
  )
}

export function RegisterPage() {
  const { isAuthenticated, register } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)

  // Etapa 1 — conta
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailApiError, setEmailApiError] = useState<string | null>(null)
  const [cpf, setCpf] = useState('')
  const [personalPhone, setPersonalPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Etapa 2 — negócio
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)
  const [document, setDocument] = useState('')
  const [address, setAddress] = useState('')
  const [addressNumber, setAddressNumber] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [uf, setUf] = useState('')
  const [cep, setCep] = useState('')
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound'>('idle')
  const [phone, setPhone] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugApiError, setSlugApiError] = useState<string | null>(null)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')

  // Etapa 3 — quiz
  const [quiz, setQuiz] = useState<Record<string, string>>({})

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Autopreenchimento de endereço pelo CEP (ViaCEP) ao completar os 8 dígitos.
  useEffect(() => {
    const digits = onlyDigits(cep)
    if (digits.length !== 8) {
      setCepStatus('idle')
      return
    }
    let cancelled = false
    setCepStatus('loading')
    const timer = setTimeout(() => {
      fetchAddressByCep(digits).then((addr) => {
        if (cancelled) return
        if (!addr) {
          setCepStatus('notfound')
          return
        }
        setCepStatus('idle')
        setAddress(addr.street)
        setNeighborhood(addr.neighborhood)
        setCity(addr.city)
        setUf(addr.state)
      })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [cep])

  // Verifica a disponibilidade do link em tempo real (debounce) enquanto o usuário digita.
  useEffect(() => {
    const value = slug.trim()
    if (!SLUG_REGEX.test(value) || value.length < 3) {
      setSlugStatus('idle')
      return
    }
    setSlugStatus('checking')
    let active = true
    const timer = setTimeout(() => {
      checkSlugAvailability(value)
        .then((res) => {
          if (active) setSlugStatus(res.available ? 'available' : 'taken')
        })
        .catch(() => {
          if (active) setSlugStatus('error')
        })
    }, 450)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [slug])

  if (isAuthenticated) return <Navigate to="/app" replace />

  const passwordError = password && password.length < 6 ? 'A senha precisa ter pelo menos 6 caracteres' : undefined
  const confirmError = confirmPassword && confirmPassword !== password ? 'As senhas não coincidem' : undefined
  const emailFormatError = email && !EMAIL_REGEX.test(email.trim()) ? 'Informe um e-mail válido' : undefined
  const slugFormatError =
    slug && !SLUG_REGEX.test(slug) ? 'Use apenas letras minúsculas, números e hífens' : undefined
  const personalPhoneError = personalPhone && !isValidPhone(personalPhone) ? 'Telefone incompleto' : undefined
  const phoneError = phone && !isValidPhone(phone) ? 'Telefone incompleto' : undefined
  const cpfError = cpf && !isValidCpf(cpf) ? 'CPF inválido' : undefined
  const documentError = document && !isValidCnpj(document) ? 'CNPJ inválido' : undefined
  const cepError = cep && !isValidCep(cep) ? 'CEP inválido' : undefined

  const slugHasError = Boolean(slugApiError || slugFormatError) || slugStatus === 'taken'
  const slugIsAvailable = slugStatus === 'available'
  // Só libera o avanço quando o link foi confirmado como livre (ou se a checagem
  // falhou por rede — o servidor revalida na criação).
  const slugUsable =
    SLUG_REGEX.test(slug) && slug.length >= 3 && (slugStatus === 'available' || slugStatus === 'error')

  const step1Valid =
    name.trim().length >= 2 &&
    EMAIL_REGEX.test(email.trim()) &&
    isValidCpf(cpf) &&
    isValidPhone(personalPhone) &&
    password.length >= 6 &&
    confirmPassword === password

  const step2Valid =
    businessName.trim().length >= 2 &&
    businessType !== null &&
    slugUsable &&
    isValidCnpj(document) &&
    address.trim().length >= 3 &&
    (cep === '' || isValidCep(cep)) &&
    (phone === '' || isValidPhone(phone))

  const step3Valid = QUIZ_QUESTIONS.every((q) => Boolean(quiz[q.key]))

  const currentStepValid = step === 1 ? step1Valid : step === 2 ? step2Valid : step3Valid

  function handleBusinessNameChange(value: string) {
    setBusinessName(value)
    if (!slugTouched) {
      setSlug(slugify(value))
      setSlugApiError(null)
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true)
    setSlug(value.toLowerCase().replace(/\s+/g, '-'))
    setSlugApiError(null)
  }

  async function handleRegister() {
    if (!businessType) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        cpf,
        phone: personalPhone,
        establishment: {
          name: businessName.trim(),
          slug,
          businessType,
          document,
          address: address.trim(),
          ...(addressNumber.trim() ? { addressNumber: addressNumber.trim() } : {}),
          ...(neighborhood.trim() ? { neighborhood: neighborhood.trim() } : {}),
          ...(city.trim() ? { city: city.trim() } : {}),
          ...(uf.trim() ? { state: uf.trim() } : {}),
          ...(cep ? { cep } : {}),
          ...(phone ? { phone } : {}),
        },
        quiz,
      })
      navigate('/app')
    } catch (err) {
      setIsSubmitting(false)
      if (err instanceof ApiError && err.status === 409) {
        const message = err.message.toLowerCase()
        const issueKeys = Object.keys(err.issues ?? {}).join(' ').toLowerCase()
        if (message.includes('slug') || message.includes('link') || issueKeys.includes('slug')) {
          setSlugApiError(err.message)
          setSlugStatus('taken')
          setStep(2)
          return
        }
        if (message.includes('mail') || issueKeys.includes('email')) {
          setEmailApiError(err.message)
          setStep(1)
          return
        }
      }
      setSubmitError(err instanceof ApiError ? err.message : 'Erro inesperado')
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!currentStepValid || isSubmitting) return
    if (step < TOTAL_STEPS) {
      setStep(step + 1)
      return
    }
    void handleRegister()
  }

  const { title, subtitle } = STEP_TITLES[step]

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca com foto — visível em telas grandes */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2 xl:w-[45%]">
        <img src="/imgTelaLogin.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/80 to-primary/45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-transparent" />

        <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
          <KairoonLogotype className="h-20 w-auto text-white" />

          <div className="max-w-md">
            <h2 className="font-display text-3xl font-bold leading-[1.15] text-white xl:text-4xl">
              Comece grátis e organize sua agenda em minutos.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/80">
              Tudo que seu negócio precisa para agendar, atender e crescer em um só lugar.
            </p>
            <ul className="mt-8 space-y-3">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="flex items-start gap-3 text-white/85">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Check className="h-3 w-3" strokeWidth={2.75} />
                  </span>
                  <span className="text-sm leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm font-medium tracking-wide text-white/70">
            Precisão no tempo. Direção no crescimento.
          </p>
        </div>
      </aside>

      {/* Painel do formulário */}
      <div className="relative flex w-full flex-col overflow-y-auto bg-primary lg:w-1/2 lg:bg-background xl:w-[55%]">
        {/* Fundo com foto + filtro navy — só no mobile */}
        <img
          src="/imgTelaLogin.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover lg:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/85 to-primary/70 lg:hidden" />

        <div className="relative z-10 m-auto flex w-full max-w-md flex-col items-center px-4 py-8">
          {/* Logo sobre o fundo — só no mobile */}
          <KairoonLogotype className="mb-6 h-12 w-auto text-white lg:hidden" />

          {/* Card do form — branco com sombra flutuante em todas as telas */}
          <div className="w-full rounded-2xl bg-surface p-5 shadow-floating sm:p-6">
            {/* Barra de progresso */}
            <div className="mb-5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs text-ink-tertiary">
                  Etapa {step} de {TOTAL_STEPS}
                </span>
                <span className="text-xs font-medium text-primary">{title}</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded bg-line-divider">
                <div
                  className="h-full rounded bg-primary transition-all duration-300"
                  style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                />
              </div>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div key={step} className="step-enter">
                <h1 className="font-display text-lg font-semibold text-ink">{title}</h1>
                <p className="mt-0.5 text-[13px] text-ink-secondary">{subtitle}</p>

                {step === 1 && (
                  <div className="mt-5 space-y-3">
                    <Input
                      label="Nome completo"
                      autoComplete="name"
                      placeholder="Seu nome"
                      leftIcon={<User className="h-4 w-4" />}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Input
                      label="E-mail"
                      type="email"
                      autoComplete="email"
                      placeholder="voce@exemplo.com"
                      leftIcon={<Mail className="h-4 w-4" />}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setEmailApiError(null)
                      }}
                      error={emailApiError ?? emailFormatError}
                    />
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Seu CPF"
                        inputMode="numeric"
                        placeholder="000.000.000-00"
                        leftIcon={<Fingerprint className="h-4 w-4" />}
                        value={cpf}
                        onChange={(e) => setCpf(formatCpf(e.target.value))}
                        error={cpfError}
                      />
                      <Input
                        label="Telefone pessoal"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="(11) 98765-4321"
                        leftIcon={<Smartphone className="h-4 w-4" />}
                        value={personalPhone}
                        onChange={(e) => setPersonalPhone(formatPhone(e.target.value))}
                        error={personalPhoneError}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <PasswordField
                        label="Senha"
                        value={password}
                        onChange={setPassword}
                        placeholder="Crie uma senha"
                        autoComplete="new-password"
                        error={passwordError}
                      />
                      <PasswordField
                        label="Confirmar senha"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Repita a senha"
                        autoComplete="new-password"
                        error={confirmError}
                      />
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="mt-5 space-y-3">
                    <Input
                      label="Nome do estabelecimento"
                      placeholder="Ex.: Barbearia do João"
                      leftIcon={<Store className="h-4 w-4" />}
                      value={businessName}
                      onChange={(e) => handleBusinessNameChange(e.target.value)}
                    />

                    <div>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">
                        Tipo de negócio
                      </span>
                      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de negócio">
                        {BUSINESS_TYPES.map(({ value, label, icon: Icon }) => {
                          const selected = businessType === value
                          return (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => setBusinessType(value)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg border p-2.5 text-left text-[13px] font-medium transition-colors duration-150',
                                selected
                                  ? 'border-secondary bg-secondary-light text-primary'
                                  : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover',
                              )}
                            >
                              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.9} />
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="CNPJ"
                        inputMode="numeric"
                        placeholder="00.000.000/0000-00"
                        leftIcon={<FileText className="h-4 w-4" />}
                        value={document}
                        onChange={(e) => setDocument(formatCnpj(e.target.value))}
                        error={documentError}
                      />
                      <Input
                        label="Telefone comercial"
                        type="tel"
                        inputMode="tel"
                        placeholder="(11) 3333-4444"
                        leftIcon={<Phone className="h-4 w-4" />}
                        value={phone}
                        onChange={(e) => setPhone(formatPhone(e.target.value))}
                        error={phoneError}
                        hint="Opcional"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="CEP"
                        inputMode="numeric"
                        placeholder="00000-000"
                        leftIcon={<MapPin className="h-4 w-4" />}
                        value={cep}
                        onChange={(e) => setCep(formatCep(e.target.value))}
                        error={
                          cepError ?? (cepStatus === 'notfound' ? 'CEP não encontrado' : undefined)
                        }
                        hint={
                          cepStatus === 'loading'
                            ? 'Buscando endereço…'
                            : 'Preenche o endereço automaticamente'
                        }
                      />
                      <Input
                        label="Número"
                        placeholder="Nº"
                        value={addressNumber}
                        onChange={(e) => setAddressNumber(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Endereço"
                        placeholder="Rua, avenida…"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                      />
                      <Input
                        label="Bairro"
                        placeholder="Bairro"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        label="Cidade"
                        placeholder="Cidade"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                      />
                      <Input
                        label="Estado"
                        placeholder="UF"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="register-slug"
                        className="mb-1.5 block text-[13px] font-medium text-ink-secondary"
                      >
                        Link público
                      </label>
                      <div className="flex">
                        <span className="inline-flex h-10 shrink-0 items-center rounded-l-lg border border-r-0 border-line bg-background px-3 text-sm text-ink-tertiary">
                          kairoon.app/
                        </span>
                        <div className="relative flex-1">
                          <input
                            id="register-slug"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="sua-barbearia"
                            value={slug}
                            onChange={(e) => handleSlugChange(e.target.value)}
                            className={cn(
                              'h-10 w-full min-w-0 rounded-r-lg border bg-surface pl-3 pr-9 text-sm text-ink placeholder:text-ink-tertiary',
                              'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                              slugHasError
                                ? 'border-error focus:border-error focus:ring-error-light'
                                : slugIsAvailable
                                  ? 'border-success focus:border-success focus:ring-success-light'
                                  : 'border-line focus:border-secondary focus:ring-secondary-light',
                            )}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                            {slugStatus === 'checking' && (
                              <Loader2 className="h-4 w-4 animate-spin text-ink-tertiary" />
                            )}
                            {slugIsAvailable && <Check className="h-4 w-4 text-success-dark" />}
                            {slugStatus === 'taken' && !slugFormatError && (
                              <X className="h-4 w-4 text-error-dark" />
                            )}
                          </span>
                        </div>
                      </div>
                      {slugHasError ? (
                        <p className="mt-1 text-xs text-error-dark">
                          {slugApiError ?? slugFormatError ?? 'Este link já está em uso. Escolha outro.'}
                        </p>
                      ) : slugStatus === 'checking' ? (
                        <p className="mt-1 text-xs text-ink-tertiary">Verificando disponibilidade…</p>
                      ) : slugIsAvailable ? (
                        <p className="mt-1 text-xs text-success-dark">Disponível! Este link é seu.</p>
                      ) : (
                        <p className="mt-1 text-xs text-ink-tertiary">
                          Seus clientes vão agendar por este link.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="mt-5 space-y-3.5">
                    {QUIZ_QUESTIONS.map((question) => (
                      <div key={question.key} role="radiogroup" aria-label={question.label}>
                        <span className="mb-1.5 block text-[13px] font-medium text-ink-secondary">
                          {question.label}
                        </span>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {question.options.map((option) => (
                            <OptionCard
                              key={option.value}
                              label={option.label}
                              selected={quiz[question.key] === option.value}
                              onSelect={() =>
                                setQuiz((current) => ({ ...current, [question.key]: option.value }))
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {submitError && step === TOTAL_STEPS && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                {step > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setStep(step - 1)}
                    disabled={isSubmitting}
                    leftIcon={<ArrowLeft className="h-4 w-4" />}
                  >
                    Voltar
                  </Button>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="flex-1"
                  disabled={!currentStepValid}
                  isLoading={isSubmitting}
                >
                  {step < TOTAL_STEPS ? 'Continuar' : 'Concluir cadastro'}
                </Button>
              </div>
            </form>

            <p className="mt-5 text-center text-sm text-ink-secondary">
              Já tem conta?{' '}
              <Link
                to="/login"
                className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
              >
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
