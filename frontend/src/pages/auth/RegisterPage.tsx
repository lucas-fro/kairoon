import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  HeartPulse,
  Loader2,
  Lock,
  Mail,
  Scissors,
  Smartphone,
  Sparkles,
  Store,
  User,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { checkSlugAvailability, updateEstablishment, updateSlug } from '../../api/establishment'
import { KairoonLogotype } from '../../components/brand/Logo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
import type { BusinessType } from '../../types/api'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const TOTAL_STEPS = 3

const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
  1: { title: 'Sua conta', subtitle: 'É com o e-mail e a senha que você entra.' },
  2: { title: 'Seu negócio', subtitle: 'O básico para colocar sua agenda no ar.' },
  3: { title: 'Quase lá', subtitle: 'Opcional: nos ajuda a personalizar sua experiência.' },
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
  const { isAuthenticated, register, setEstablishment } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // Destino pós-cadastro: o `from` guardado no state (quando veio de uma rota
  // protegida) tem prioridade; senão, se veio de um card de plano da LP
  // (?plan=&cycle=), leva direto pro checkout daquele plano.
  const stateFrom = (location.state as { from?: string } | null)?.from
  const planParam = searchParams.get('plan')
  const checkoutFrom =
    planParam === 'basico' || planParam === 'essencial'
      ? `/checkout?plan=${planParam}&cycle=${searchParams.get('cycle') === 'monthly' ? 'monthly' : 'yearly'}`
      : undefined
  const from = stateFrom ?? checkoutFrom

  const [step, setStep] = useState(1)
  // A conta é criada ao concluir a etapa 1; a partir daí o usuário já está
  // logado mas segue no wizard; este flag impede o guard de abortar o fluxo.
  const [onboarding, setOnboarding] = useState(false)

  // Etapa 1: conta (identidade + login do dono) + aceite legal
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [emailApiError, setEmailApiError] = useState<string | null>(null)
  const [personalPhone, setPersonalPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Etapa 2: negócio
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState<BusinessType | null>(null)
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugApiError, setSlugApiError] = useState<string | null>(null)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')

  // Aceite dos Termos + Política (etapa 1, obrigatório para criar a conta)
  const [acceptedLegal, setAcceptedLegal] = useState(false)

  // Etapa 3: quiz (opcional)
  const [quiz, setQuiz] = useState<Record<string, string>>({})

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  // Já logado e fora do onboarding recém-criado → vai pro destino. Durante o
  // wizard (onboarding) não redireciona, mesmo já autenticado após a etapa 1.
  if (isAuthenticated && !onboarding) return <Navigate to={from ?? '/app'} replace />

  const passwordError = password && password.length < 6 ? 'A senha precisa ter pelo menos 6 caracteres' : undefined
  const confirmError = confirmPassword && confirmPassword !== password ? 'As senhas não coincidem' : undefined
  const emailFormatError = email && !EMAIL_REGEX.test(email.trim()) ? 'Informe um e-mail válido' : undefined
  const slugFormatError =
    slug && !SLUG_REGEX.test(slug) ? 'Use apenas letras minúsculas, números e hífens' : undefined
  const personalPhoneError = personalPhone && !isValidPhone(personalPhone) ? 'Telefone incompleto' : undefined

  const slugHasError = Boolean(slugApiError || slugFormatError) || slugStatus === 'taken'
  const slugIsAvailable = slugStatus === 'available'
  // Só libera o avanço quando o link foi confirmado como livre (ou se a checagem
  // falhou por rede: o servidor revalida na criação).
  const slugUsable =
    SLUG_REGEX.test(slug) && slug.length >= 3 && (slugStatus === 'available' || slugStatus === 'error')

  const step1Valid =
    name.trim().length >= 2 &&
    EMAIL_REGEX.test(email.trim()) &&
    (personalPhone === '' || isValidPhone(personalPhone)) &&
    password.length >= 6 &&
    confirmPassword === password &&
    acceptedLegal

  const step2Valid = businessName.trim().length >= 2 && businessType !== null && slugUsable

  // Quiz é opcional: a etapa final sempre pode concluir.
  const step3Valid = true
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

  // Etapa 1: cria a conta (já loga e inicia o teste grátis de 14 dias). A partir
  // daqui o usuário segue autenticado dentro do wizard (ver flag `onboarding`).
  async function handleCreateAccount() {
    setSubmitError(null)
    setEmailApiError(null)
    setIsSubmitting(true)
    setOnboarding(true)
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        ...(personalPhone ? { phone: personalPhone } : {}),
        acceptedLegal: true,
      })
      setIsSubmitting(false)
      setStep(2)
    } catch (err) {
      setIsSubmitting(false)
      // Falhou: desfaz o flag (a conta não foi criada) para o guard e o link
      // "Entrar" voltarem ao normal na etapa 1.
      setOnboarding(false)
      if (err instanceof ApiError && err.status === 409) {
        setEmailApiError(err.message)
        return
      }
      setSubmitError(err instanceof ApiError ? err.message : 'Erro inesperado')
    }
  }

  // Etapa 2: grava o negócio (nome/tipo/contato) e o link público escolhido
  // (a conta nasceu com um link provisório).
  async function handleSaveBusiness() {
    setSubmitError(null)
    setIsSubmitting(true)
    // Contato público reaproveita o e-mail/telefone informados na etapa 1: um só
    // de cada, sem pedir os mesmos dados duas vezes.
    const contactWhatsapp = onlyDigits(personalPhone)
    const contactEmail = email.trim()
    try {
      const updated = await updateEstablishment({
        name: businessName.trim(),
        ...(businessType ? { businessType } : {}),
        ...(contactEmail ? { email: contactEmail } : {}),
        ...(contactWhatsapp ? { socials: { whatsapp: contactWhatsapp } } : {}),
      })
      setEstablishment(updated)
      const withSlug = await updateSlug(slug)
      setEstablishment(withSlug)
      setIsSubmitting(false)
      setStep(3)
    } catch (err) {
      setIsSubmitting(false)
      if (err instanceof ApiError && err.status === 409) {
        setSlugApiError(err.message)
        setSlugStatus('taken')
        return
      }
      setSubmitError(err instanceof ApiError ? err.message : 'Erro inesperado')
    }
  }

  // Etapa 3: salva o quiz (opcional) e entra no app (ou no checkout, se veio de
  // um card de plano da LP).
  async function handleFinish() {
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      if (Object.keys(quiz).length > 0) {
        const updated = await updateEstablishment({ quiz })
        setEstablishment(updated)
      }
      navigate(from ?? '/app')
    } catch (err) {
      setIsSubmitting(false)
      setSubmitError(err instanceof ApiError ? err.message : 'Erro inesperado')
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!currentStepValid || isSubmitting) return
    if (step === 1) return void handleCreateAccount()
    if (step === 2) return void handleSaveBusiness()
    void handleFinish()
  }

  const { title, subtitle } = STEP_TITLES[step]

  return (
    <div className="flex min-h-screen">
      {/* Painel de marca com foto (visível em telas grandes) */}
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
        {/* Fundo com foto + filtro navy (só no mobile) */}
        <img
          src="/imgTelaLogin.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover lg:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/85 to-primary/70 lg:hidden" />

        <div className="relative z-10 m-auto flex w-full max-w-md flex-col items-center px-4 py-8">
          {/* Logo sobre o fundo (só no mobile) */}
          <KairoonLogotype className="mb-6 h-12 w-auto text-white lg:hidden" />

          {/* Card do form (branco com sombra flutuante em todas as telas) */}
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
                      hint="Você usa este e-mail para entrar."
                    />
                    <Input
                      label="Telefone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="(11) 98765-4321"
                      leftIcon={<Smartphone className="h-4 w-4" />}
                      value={personalPhone}
                      onChange={(e) => setPersonalPhone(formatPhone(e.target.value))}
                      error={personalPhoneError}
                      hint="Para você acessar sua conta e receber avisos."
                    />
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

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-background/60 p-3">
                      <input
                        type="checkbox"
                        checked={acceptedLegal}
                        onChange={(e) => setAcceptedLegal(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-line text-primary focus:ring-2 focus:ring-secondary-light"
                      />
                      <span className="text-[13px] leading-snug text-ink-secondary">
                        Li e concordo com a{' '}
                        <a
                          href="/politica-de-privacidade"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Política de Privacidade
                        </a>{' '}
                        e os{' '}
                        <a
                          href="/termos-de-uso"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          Termos de Uso
                        </a>
                        .
                      </span>
                    </label>
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

              {submitError && (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{submitError}</span>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                {/* Sem "Voltar" na etapa 2: a conta já foi criada na etapa 1. */}
                {step > 2 && (
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

            {!onboarding && (
              <p className="mt-5 text-center text-sm text-ink-secondary">
                Já tem conta?{' '}
                <Link
                  to={{ pathname: '/login', search: location.search }}
                  state={location.state}
                  className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
                >
                  Entrar
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
