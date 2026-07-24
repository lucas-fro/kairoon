import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
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
import { getPlans, getSubscription, subscribe } from '../../api/payments'
import { KairoonLogotype } from '../../components/brand/Logo'
import { BillingCycleToggle, getAnnualDiscountPercent } from '../../components/payments/BillingCycleToggle'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../contexts/AuthContext'
import { usePlan } from '../../hooks/usePlan'
import { addDays, todayStr } from '../../lib/dates'
import {
  formatBRL,
  formatCep,
  formatDate,
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
const TRIAL_DAYS = 14

function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** Formata a validade digitada como MM/AA (só dígitos, barra automática). */
function formatExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, establishment, setEstablishment } = useAuth()

  const requestedPlan = searchParams.get('plan')
  const planSlug: PlanSlug = requestedPlan === 'basico' ? 'basico' : 'essencial'
  // Anual é o padrão em toda exibição de planos; só cai em mensal se a URL
  // pedir explicitamente (?cycle=monthly).
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    searchParams.get('cycle') === 'monthly' ? 'monthly' : 'yearly',
  )
  // Parcelas do cartão — só no anual (o mensal é sempre à vista). 1 = à vista
  // (assinatura recorrente); 2–12 = cobrança parcelada imediata.
  const [installments, setInstallments] = useState(1)

  function handleCycleChange(cycle: BillingCycle) {
    setBillingCycle(cycle)
    if (cycle === 'monthly') setInstallments(1)
  }

  const plansQuery = useQuery({ queryKey: ['payments', 'plans'], queryFn: getPlans })
  const plan = plansQuery.data?.[planSlug]
  const cycleCents = plan ? (billingCycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents) : null
  const discountPercent = plan ? getAnnualDiscountPercent(plan.monthlyCents, plan.yearlyCents) : 0
  // Parcelado de verdade = anual com 2+ parcelas (cobrança imediata, sem trial).
  const isInstallment = billingCycle === 'yearly' && installments >= 2
  const perInstallmentCents = cycleCents && installments > 0 ? Math.round(cycleCents / installments) : 0

  const subscriptionQuery = useQuery({ queryKey: ['payments', 'subscription'], queryFn: getSubscription })
  const currentSub = subscriptionQuery.data?.subscription ?? null
  const isChange = currentSub !== null && currentSub.status !== 'canceled'

  // Data real da 1ª cobrança — espelha o backend (payments/service.ts#subscribe):
  // troca de plano e teste expirado cobram hoje; teste em andamento cobra no fim
  // do teste (trialEndsAt, sem reiniciar os 14 dias); conta legada sem teste
  // ganha 14 dias de cortesia. Evita prometer "14 dias grátis" pra quem não tem.
  const accessQuery = usePlan()
  const trialState = accessQuery.data?.state
  const trialEndsAtIso = accessQuery.data?.trialEndsAt ?? null
  const firstChargeDate =
    isChange || trialState === 'trial_expired'
      ? todayStr()
      : trialState === 'trial' && trialEndsAtIso
        ? trialEndsAtIso.slice(0, 10)
        : addDays(todayStr(), TRIAL_DAYS)
  const firstChargeLabel = formatDate(firstChargeDate)

  // Etapa 1 — cartão
  const [holderName, setHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
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

  // Validade: parseia MM/AA e confere que o mês é válido e não está no passado.
  const expiryDigits = onlyDigits(expiry)
  const expMonth = expiryDigits.slice(0, 2)
  const expYear2 = expiryDigits.slice(2, 4)
  const expiryValid = (() => {
    if (!/^(0[1-9]|1[0-2])$/.test(expMonth) || expYear2.length !== 2) return false
    const now = new Date()
    const year = 2000 + Number(expYear2)
    const month = Number(expMonth)
    return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)
  })()

  const cardComplete =
    holderName.trim().length >= 2 &&
    onlyDigits(cardNumber).length >= 13 &&
    expiryValid &&
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
        installments: isInstallment ? installments : 1,
        card: {
          holderName: holderName.trim(),
          number: onlyDigits(cardNumber),
          expiryMonth: expMonth,
          expiryYear: `20${expYear2}`,
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

      // Sincroniza o establishment no contexto (o plano é liberado na hora).
      const me = await getMe()
      setEstablishment(me.establishment)

      toast.success(
        isInstallment
          ? `Assinatura confirmada! Plano parcelado em ${installments}x no cartão.`
          : isChange
            ? 'Plano alterado com sucesso!'
            : trialState === 'trial_expired'
              ? 'Assinatura ativada! Seu acesso foi liberado.'
              : trialState === 'trial'
                ? `Assinatura confirmada! Primeira cobrança em ${firstChargeLabel}.`
                : 'Pronto! Seu teste grátis de 14 dias começou.',
      )
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
          {/* Resumo da compra (no mobile fica embaixo do formulário) */}
          <div className="order-2 lg:sticky lg:top-8">
            <Card>
              <CardContent className="p-5 sm:p-6">
                <h2 className="font-display text-base font-semibold text-ink">Resumo da assinatura</h2>

                <div className="mt-4">
                  <BillingCycleToggle value={billingCycle} onChange={handleCycleChange} discountPercent={discountPercent} />
                </div>

                {billingCycle === 'yearly' && plan && (
                  <div className="mt-4">
                    <label htmlFor="installments" className="mb-1.5 block text-xs font-medium text-ink-secondary">
                      Parcelar no cartão
                    </label>
                    <select
                      id="installments"
                      value={installments}
                      onChange={(e) => setInstallments(Number(e.target.value))}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm font-medium text-ink outline-none transition-colors duration-150 focus:border-primary"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>
                          {n === 1
                            ? `À vista · ${formatBRL(plan.yearlyCents)}`
                            : `${n}x de ${formatBRL(Math.round(plan.yearlyCents / n))} sem juros`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
                        {isInstallment
                          ? `${installments}x de ${formatBRL(perInstallmentCents)} sem juros no cartão`
                          : billingCycle === 'yearly'
                            ? `Cobrado uma vez por ano · equivale a ${formatBRL(plan.yearlyCents / 12)}/mês`
                            : 'Cobrado mensalmente'}
                      </p>
                      {isInstallment ? (
                        <div className="mt-3 rounded-lg bg-secondary-light px-3 py-2.5 text-xs text-primary">
                          <span className="font-semibold">1ª parcela cobrada hoje.</span> As outras{' '}
                          {installments - 1} caem automaticamente, uma por mês, no seu cartão — sem juros.
                        </div>
                      ) : !isChange ? (
                        <div className="mt-3 rounded-lg bg-secondary-light px-3 py-2.5 text-xs text-primary">
                          {trialState === 'trial_expired' ? (
                            <>
                              <span className="font-semibold">Cobrança imediata.</span> Sua assinatura
                              libera o acesso na hora e a primeira cobrança acontece hoje.
                            </>
                          ) : trialState === 'trial' ? (
                            <>
                              <span className="font-semibold">Teste grátis até {firstChargeLabel}.</span> A
                              primeira cobrança só acontece nessa data. Cancele antes e não paga nada.
                            </>
                          ) : (
                            <>
                              <span className="font-semibold">14 dias grátis.</span> Primeira cobrança em{' '}
                              {firstChargeLabel}. Cancele antes e não paga nada.
                            </>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {submitError && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-error-light px-3 py-2.5 text-sm text-error-dark">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{submitError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  form="checkout-form"
                  size="lg"
                  className="mt-4 w-full"
                  disabled={!formValid || !plan}
                  isLoading={isSubmitting}
                  leftIcon={<Lock className="h-4 w-4" />}
                >
                  {isInstallment
                    ? `Parcelar em ${installments}x`
                    : isChange
                      ? 'Trocar de plano'
                      : trialState === 'trial_expired'
                        ? 'Assinar agora'
                        : trialState === 'trial'
                          ? 'Assinar plano'
                          : 'Começar 14 dias grátis'}
                </Button>

                <div className="mt-3 flex items-center gap-3 rounded-lg bg-success-light px-4 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white">
                    <ShieldCheck className="h-5 w-5 text-success-dark" />
                  </span>
                  <p className="text-xs leading-snug text-ink-secondary">
                    Pagamento seguro processado pelo Asaas. Seus dados de cartão não ficam salvos no Kairoon e você
                    cancela quando quiser, sem multa.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Formulário */}
          <Card className="order-1">
            <CardContent className="p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4 border-b border-line-divider pb-4">
                <div>
                  <h1 className="font-display text-xl font-semibold text-ink">Finalizar assinatura</h1>
                  <p className="mt-1 text-sm text-ink-secondary">Preencha as etapas abaixo pra ativar seu plano.</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-ink-tertiary">
                    Processado por
                  </span>
                  <img src="/asaas_logo.png" alt="Asaas" className="ml-auto h-6 w-auto sm:h-7" />
                </div>
              </div>

              <form id="checkout-form" onSubmit={handleSubmit} noValidate className="mt-6 space-y-3">
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
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Validade"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/AA"
                      maxLength={5}
                      leftIcon={<Calendar className="h-4 w-4" />}
                      value={expiry}
                      onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      error={expiry.length === 5 && !expiryValid ? 'Validade inválida' : undefined}
                    />
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
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
