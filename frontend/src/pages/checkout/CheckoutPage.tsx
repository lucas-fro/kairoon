import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  CreditCard,
  Home,
  IdCard,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../../api/auth'
import { ApiError } from '../../api/client'
import { getPlans, subscribe } from '../../api/payments'
import { KairoonLogotype } from '../../components/brand/Logo'
import { BillingCycleToggle, getAnnualDiscountPercent } from '../../components/payments/BillingCycleToggle'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../contexts/AuthContext'
import {
  formatBRL,
  formatCep,
  formatDocument,
  formatPhone,
  isValidCep,
  isValidDocument,
  isValidPhone,
  onlyDigits,
} from '../../lib/format'
import { fetchAddressByCep } from '../../lib/viacep'
import type { BillingCycle, PlanSlug } from '../../types/api'
import { CheckoutSection } from './CheckoutSection'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 15 }, (_, i) => String(CURRENT_YEAR + i))

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, establishment, setEstablishment } = useAuth()

  const requestedPlan = searchParams.get('plan')
  const planSlug: PlanSlug = requestedPlan === 'basico' ? 'basico' : 'essencial'
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly',
  )

  const plansQuery = useQuery({ queryKey: ['payments', 'plans'], queryFn: getPlans })
  const plan = plansQuery.data?.[planSlug]
  const cycleCents = plan ? (billingCycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents) : null
  const discountPercent = plan ? getAnnualDiscountPercent(plan.monthlyCents, plan.yearlyCents) : 0

  // Etapa 1 — cartão
  const [holderName, setHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryYear, setExpiryYear] = useState('')
  const [ccv, setCcv] = useState('')

  // Etapa 2 — dados pessoais
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [cpfCnpj, setCpfCnpj] = useState(user?.cpf ?? establishment?.document ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')

  // Etapa 3 — endereço
  const [postalCode, setPostalCode] = useState(establishment?.cep ?? '')
  const [addressNumber, setAddressNumber] = useState(establishment?.addressNumber ?? '')
  const [street, setStreet] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound'>('idle')
  const cepDirty = useRef(false)

  // Acordeão: uma etapa aberta por vez; maxUnlocked só cresce (nunca retranca
  // uma etapa já concluída, mesmo que o usuário apague algo temporariamente).
  const [activeStep, setActiveStep] = useState(1)
  const [maxUnlocked, setMaxUnlocked] = useState(1)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const cardComplete =
    holderName.trim().length >= 2 &&
    onlyDigits(cardNumber).length >= 13 &&
    /^(0[1-9]|1[0-2])$/.test(expiryMonth) &&
    /^\d{4}$/.test(expiryYear) &&
    /^\d{3,4}$/.test(ccv)

  const personalComplete =
    name.trim().length >= 2 && EMAIL_REGEX.test(email.trim()) && isValidDocument(cpfCnpj) && isValidPhone(phone)

  const addressComplete = isValidCep(postalCode) && cepStatus !== 'loading' && addressNumber.trim().length >= 1

  const formValid = cardComplete && personalComplete && addressComplete

  // Avança automaticamente pra próxima etapa assim que a atual fica completa.
  useEffect(() => {
    if (cardComplete && maxUnlocked === 1) {
      setMaxUnlocked(2)
      setActiveStep(2)
    }
  }, [cardComplete, maxUnlocked])

  useEffect(() => {
    if (personalComplete && maxUnlocked === 2) {
      setMaxUnlocked(3)
      setActiveStep(3)
    }
  }, [personalComplete, maxUnlocked])

  // Autopreenchimento de endereço pelo CEP (ViaCEP) — só dispara quando o
  // usuário edita o CEP, igual ao padrão já usado em Configurações.
  useEffect(() => {
    if (!cepDirty.current) return
    const digits = onlyDigits(postalCode)
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
        setStreet(addr.street)
        setNeighborhood(addr.neighborhood)
        setCity(addr.city)
        setState(addr.state)
      })
    }, 500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [postalCode])

  function openStep(step: number) {
    if (step > maxUnlocked) return
    setActiveStep(step)
  }

  function sectionStatus(step: number): 'locked' | 'active' | 'done' {
    if (step > maxUnlocked) return 'locked'
    if (step === activeStep) return 'active'
    return 'done'
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!formValid || isSubmitting) return
    setSubmitError(null)
    setIsSubmitting(true)
    try {
      await subscribe({
        planSlug,
        billingCycle,
        card: {
          holderName: holderName.trim(),
          number: onlyDigits(cardNumber),
          expiryMonth,
          expiryYear,
          ccv,
        },
        holder: {
          name: name.trim(),
          email: email.trim(),
          cpfCnpj: onlyDigits(cpfCnpj),
          postalCode: onlyDigits(postalCode),
          addressNumber: addressNumber.trim(),
          phone: onlyDigits(phone),
        },
      })

      // Sincroniza o establishment no contexto — o plano em si só vira 'ativo'
      // quando o webhook do Asaas confirmar a primeira cobrança.
      const me = await getMe()
      setEstablishment(me.establishment)

      toast.success('Assinatura criada! Estamos confirmando o pagamento com a operadora do cartão.')
      navigate('/app')
    } catch (err) {
      setIsSubmitting(false)
      setSubmitError(err instanceof ApiError ? err.message : 'Não foi possível concluir a assinatura')
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-primary via-primary to-secondary px-4 py-10 sm:px-6 lg:py-14">
      <div className="relative z-10 mb-8 flex justify-center">
        <Link to="/app">
          <KairoonLogotype className="h-12 w-auto text-white sm:h-14" />
        </Link>
      </div>

      <div className="relative z-10 mx-auto max-w-4xl">
        <Link
          to="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/80 transition-colors duration-150 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
          {/* Resumo da compra */}
          <div className="order-1 lg:order-2 lg:sticky lg:top-8">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold text-ink">Resumo da assinatura</h2>

                <div className="mt-4">
                  <BillingCycleToggle value={billingCycle} onChange={setBillingCycle} discountPercent={discountPercent} />
                </div>

                <div className="mt-4 border-t border-line-divider pt-4">
                  {plansQuery.isPending && <Skeleton className="h-14 w-full" />}
                  {plan && (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">Plano {plan.name}</span>
                        <span className="font-display text-xl font-bold text-primary">
                          {formatBRL(cycleCents ?? 0)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-ink-secondary">
                        {billingCycle === 'yearly'
                          ? `Cobrado uma vez por ano · equivale a ${formatBRL(plan.yearlyCents / 12)}/mês`
                          : 'Cobrado mensalmente'}
                      </p>
                    </>
                  )}
                </div>

                <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-background px-3 py-2.5 text-xs text-ink-secondary">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" />
                  Cobrança recorrente processada com segurança pelo Asaas. Cancele quando quiser, sem multa.
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Formulário */}
          <Card className="order-2 lg:order-1">
            <CardContent className="p-5 sm:p-7">
              <h1 className="font-display text-xl font-semibold text-ink">Finalizar assinatura</h1>
              <p className="mt-1 text-sm text-ink-secondary">Preencha as etapas abaixo pra ativar seu plano.</p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
                <CheckoutSection
                  step={1}
                  title="Dados do cartão"
                  icon={CreditCard}
                  status={sectionStatus(1)}
                  summary={cardComplete ? `${holderName} · •••• ${onlyDigits(cardNumber).slice(-4)}` : undefined}
                  onOpen={() => openStep(1)}
                >
                  <Input
                    label="Nome impresso no cartão"
                    autoComplete="cc-name"
                    leftIcon={<User className="h-4 w-4" />}
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                  />
                  <Input
                    label="Número do cartão"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                    leftIcon={<CreditCard className="h-4 w-4" />}
                    value={formatCardNumber(cardNumber)}
                    onChange={(e) => setCardNumber(e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <Select
                      label="Mês"
                      autoComplete="cc-exp-month"
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(e.target.value)}
                    >
                      <option value="">MM</option>
                      {MONTHS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Ano"
                      autoComplete="cc-exp-year"
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(e.target.value)}
                    >
                      <option value="">AAAA</option>
                      {YEARS.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </Select>
                    <Input
                      label="CVV"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="000"
                      maxLength={4}
                      leftIcon={<Lock className="h-4 w-4" />}
                      value={ccv}
                      onChange={(e) => setCcv(onlyDigits(e.target.value).slice(0, 4))}
                    />
                  </div>
                </CheckoutSection>

                <CheckoutSection
                  step={2}
                  title="Dados pessoais"
                  icon={User}
                  status={sectionStatus(2)}
                  summary={personalComplete ? `${name} · ${email}` : undefined}
                  onOpen={() => openStep(2)}
                >
                  <Input
                    label="Nome completo"
                    leftIcon={<User className="h-4 w-4" />}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Input
                    label="E-mail"
                    type="email"
                    leftIcon={<Mail className="h-4 w-4" />}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="CPF ou CNPJ"
                      leftIcon={<IdCard className="h-4 w-4" />}
                      value={formatDocument(cpfCnpj)}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                    />
                    <Input
                      label="Telefone"
                      type="tel"
                      leftIcon={<Phone className="h-4 w-4" />}
                      value={formatPhone(phone)}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </CheckoutSection>

                <CheckoutSection
                  step={3}
                  title="Endereço"
                  icon={MapPin}
                  status={sectionStatus(3)}
                  summary={
                    addressComplete
                      ? `${street ? `${street}, ` : ''}${addressNumber} · ${formatCep(postalCode)}`
                      : undefined
                  }
                  onOpen={() => openStep(3)}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="CEP"
                      inputMode="numeric"
                      leftIcon={<MapPin className="h-4 w-4" />}
                      value={formatCep(postalCode)}
                      onChange={(e) => {
                        cepDirty.current = true
                        setPostalCode(e.target.value)
                      }}
                      placeholder="00000-000"
                      hint={
                        cepStatus === 'loading'
                          ? 'Buscando endereço…'
                          : cepStatus === 'notfound'
                            ? 'CEP não encontrado'
                            : 'Preenche o endereço automaticamente'
                      }
                    />
                    <Input
                      label="Número do endereço"
                      leftIcon={<Home className="h-4 w-4" />}
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                    />
                  </div>
                  {street && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div className="sm:col-span-2">
                        <Input label="Rua" value={street} onChange={(e) => setStreet(e.target.value)} />
                      </div>
                      <Input label="Bairro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                    </div>
                  )}
                  {city && (
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} />
                      <Input
                        label="UF"
                        value={state}
                        onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                      />
                    </div>
                  )}
                </CheckoutSection>

                {submitError && (
                  <div className="flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!formValid || !plan}
                  isLoading={isSubmitting}
                  leftIcon={<Lock className="h-4 w-4" />}
                >
                  Assinar {plan ? `— ${formatBRL(cycleCents ?? 0)}` : ''}
                </Button>

                <div className="flex flex-col items-center gap-2 pt-1">
                  <img src="/asaas_logo.png" alt="Asaas" className="h-5 w-auto opacity-70" />
                  <p className="flex items-center gap-1.5 text-center text-xs text-ink-tertiary">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    Pagamento processado com segurança pelo Asaas — seus dados de cartão nunca ficam salvos no
                    Kairoon.
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
