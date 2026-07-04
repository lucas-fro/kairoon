import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  FileText,
  Fingerprint,
  HeartPulse,
  Lock,
  Mail,
  MapPin,
  Phone,
  Scissors,
  Sparkles,
  Store,
  User,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
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
} from '../../lib/format'
import type { BusinessType } from '../../types/api'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const TOTAL_STEPS = 3

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Sua conta', subtitle: 'Comece criando seu acesso.' },
  2: { title: 'Seu negócio', subtitle: 'Conte um pouco sobre seu estabelecimento.' },
  3: { title: 'Só mais 30 segundos', subtitle: 'Nos conte sobre seu negócio.' },
}

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
      { value: 'mais-de-5', label: 'Mais de 5' },
    ],
  },
  {
    key: 'monthlyClients',
    label: 'Clientes por mês?',
    options: [
      { value: 'ate-50', label: 'Até 50' },
      { value: '51-150', label: '51 a 150' },
      { value: 'mais-de-150', label: 'Mais de 150' },
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
        'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150',
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
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Etapa 2 — negócio
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)
  const [document, setDocument] = useState('')
  const [address, setAddress] = useState('')
  const [cep, setCep] = useState('')
  const [phone, setPhone] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugApiError, setSlugApiError] = useState<string | null>(null)

  // Etapa 3 — quiz
  const [quiz, setQuiz] = useState<Record<string, string>>({})

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isAuthenticated) return <Navigate to="/app" replace />

  const passwordError = password && password.length < 6 ? 'A senha precisa ter pelo menos 6 caracteres' : undefined
  const confirmError = confirmPassword && confirmPassword !== password ? 'As senhas não coincidem' : undefined
  const emailFormatError = email && !EMAIL_REGEX.test(email.trim()) ? 'Informe um e-mail válido' : undefined
  const slugFormatError =
    slug && !SLUG_REGEX.test(slug) ? 'Use apenas letras minúsculas, números e hífens' : undefined
  const phoneError = phone && !isValidPhone(phone) ? 'Telefone incompleto' : undefined
  const cpfError = cpf && !isValidCpf(cpf) ? 'CPF inválido' : undefined
  const documentError = document && !isValidCnpj(document) ? 'CNPJ inválido' : undefined
  const cepError = cep && !isValidCep(cep) ? 'CEP inválido' : undefined

  const step1Valid =
    name.trim().length >= 2 &&
    EMAIL_REGEX.test(email.trim()) &&
    isValidCpf(cpf) &&
    password.length >= 6 &&
    confirmPassword === password

  const step2Valid =
    businessName.trim().length >= 2 &&
    businessType !== null &&
    SLUG_REGEX.test(slug) &&
    isValidCnpj(document) &&
    address.trim().length >= 5 &&
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
        establishment: {
          name: businessName.trim(),
          slug,
          businessType,
          document,
          address: address.trim(),
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <img src="/logotipo.svg" alt="Kairoon" className="mb-8 h-12 w-auto" />

      <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-elevated sm:p-8">
        {/* Barra de progresso */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between">
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
            <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
            <p className="mt-1 text-sm text-ink-secondary">{subtitle}</p>

            {step === 1 && (
              <div className="mt-6 space-y-4">
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
                <Input
                  label="Seu CPF"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  leftIcon={<Fingerprint className="h-4 w-4" />}
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  error={cpfError}
                  hint="Necessário para criar a conta do responsável"
                />
                <PasswordField
                  label="Senha"
                  value={password}
                  onChange={setPassword}
                  placeholder="Crie uma senha"
                  autoComplete="new-password"
                  error={passwordError}
                  hint="Mínimo de 6 caracteres"
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
            )}

            {step === 2 && (
              <div className="mt-6 space-y-4">
                <Input
                  label="Nome do estabelecimento"
                  placeholder="Ex.: Barbearia do João"
                  leftIcon={<Store className="h-4 w-4" />}
                  value={businessName}
                  onChange={(e) => handleBusinessNameChange(e.target.value)}
                />

                <div>
                  <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                    Tipo de negócio
                  </span>
                  <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de negócio">
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
                            'flex flex-col items-center gap-2 rounded-xl border p-4 text-center text-sm font-medium transition-colors duration-150',
                            selected
                              ? 'border-secondary bg-secondary-light text-primary'
                              : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover',
                          )}
                        >
                          <Icon className="h-6 w-6" strokeWidth={1.9} />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Input
                  label="CNPJ"
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  leftIcon={<FileText className="h-4 w-4" />}
                  value={document}
                  onChange={(e) => setDocument(formatCnpj(e.target.value))}
                  error={documentError}
                />

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input
                    label="Endereço"
                    placeholder="Rua, número — bairro, cidade/UF"
                    leftIcon={<MapPin className="h-4 w-4" />}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                  <Input
                    label="CEP (opcional)"
                    inputMode="numeric"
                    placeholder="00000-000"
                    value={cep}
                    onChange={(e) => setCep(formatCep(e.target.value))}
                    error={cepError}
                  />
                </div>

                <Input
                  label="Telefone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 98765-4321"
                  leftIcon={<Phone className="h-4 w-4" />}
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  error={phoneError}
                  hint="Opcional — usado no contato com clientes"
                />

                <div>
                  <label
                    htmlFor="register-slug"
                    className="mb-2 block text-[13px] font-medium text-ink-secondary"
                  >
                    Link público
                  </label>
                  <div className="flex">
                    <span className="inline-flex h-10 shrink-0 items-center rounded-l-lg border border-r-0 border-line bg-background px-3 text-sm text-ink-tertiary">
                      kairoon.app/
                    </span>
                    <input
                      id="register-slug"
                      type="text"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="sua-barbearia"
                      value={slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      className={cn(
                        'h-10 w-full min-w-0 rounded-r-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary',
                        'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                        slugApiError || slugFormatError
                          ? 'border-error focus:border-error focus:ring-error-light'
                          : 'border-line focus:border-secondary focus:ring-secondary-light',
                      )}
                    />
                  </div>
                  {slugApiError || slugFormatError ? (
                    <p className="mt-1.5 text-xs text-error-dark">{slugApiError ?? slugFormatError}</p>
                  ) : (
                    <p className="mt-1.5 text-xs text-ink-tertiary">
                      Seus clientes vão agendar por este link.
                    </p>
                  )}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="mt-6 space-y-5">
                {QUIZ_QUESTIONS.map((question) => (
                  <div key={question.key} role="radiogroup" aria-label={question.label}>
                    <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
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

          <div className="mt-6 flex items-center gap-3">
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
      </div>

      <p className="mt-6 text-center text-sm text-ink-secondary">
        Já tem conta?{' '}
        <Link
          to="/login"
          className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  )
}
