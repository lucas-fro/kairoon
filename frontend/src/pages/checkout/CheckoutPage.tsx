import { useState } from 'react'
import type { FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ArrowLeft, CreditCard, Lock, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMe } from '../../api/auth'
import { ApiError } from '../../api/client'
import { getPlans, subscribe } from '../../api/payments'
import { KairoonLogotype } from '../../components/brand/Logo'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
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
import type { BillingCycle, PlanSlug } from '../../types/api'

const EMAIL_REGEX = /^\S+@\S+\.\S+$/

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
  const billingCycle: BillingCycle = searchParams.get('cycle') === 'yearly' ? 'yearly' : 'monthly'

  const plansQuery = useQuery({ queryKey: ['payments', 'plans'], queryFn: getPlans })
  const plan = plansQuery.data?.[planSlug]
  const cycleCents = plan ? (billingCycle === 'yearly' ? plan.yearlyCents : plan.monthlyCents) : null

  // Cartão
  const [holderName, setHolderName] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryYear, setExpiryYear] = useState('')
  const [ccv, setCcv] = useState('')

  // Titular / cobrança
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [cpfCnpj, setCpfCnpj] = useState(user?.cpf ?? establishment?.document ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [postalCode, setPostalCode] = useState(establishment?.cep ?? '')
  const [addressNumber, setAddressNumber] = useState(establishment?.addressNumber ?? '')

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const formValid =
    holderName.trim().length >= 2 &&
    onlyDigits(cardNumber).length >= 13 &&
    /^(0[1-9]|1[0-2])$/.test(expiryMonth) &&
    /^\d{4}$/.test(expiryYear) &&
    /^\d{3,4}$/.test(ccv) &&
    name.trim().length >= 2 &&
    EMAIL_REGEX.test(email.trim()) &&
    isValidDocument(cpfCnpj) &&
    isValidPhone(phone) &&
    isValidCep(postalCode) &&
    addressNumber.trim().length >= 1

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
    <div className="flex min-h-screen flex-col items-center bg-background px-4 py-10">
      <div className="mb-8">
        <Link to="/app">
          <KairoonLogotype className="h-10 w-auto text-primary" />
        </Link>
      </div>

      <div className="w-full max-w-lg">
        <Link
          to="/app"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-secondary transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <h1 className="font-display text-xl font-semibold text-ink">Assinar plano</h1>

            <div className="mt-4 flex items-center justify-between rounded-lg bg-background px-4 py-3">
              {plansQuery.isPending && <Skeleton className="h-5 w-40" />}
              {plan && (
                <>
                  <div>
                    <p className="font-medium text-ink">Plano {plan.name}</p>
                    <p className="text-xs text-ink-secondary">
                      {billingCycle === 'yearly' ? 'Cobrado anualmente' : 'Cobrado mensalmente'}
                    </p>
                  </div>
                  <p className="font-display text-lg font-semibold text-primary">
                    {formatBRL(cycleCents ?? 0)}
                  </p>
                </>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink-secondary">
                  <CreditCard className="h-4 w-4" />
                  Dados do cartão
                </div>
                <div className="space-y-3">
                  <Input
                    label="Nome impresso no cartão"
                    autoComplete="cc-name"
                    value={holderName}
                    onChange={(e) => setHolderName(e.target.value)}
                  />
                  <Input
                    label="Número do cartão"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                    value={formatCardNumber(cardNumber)}
                    onChange={(e) => setCardNumber(e.target.value)}
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <Input
                      label="Mês"
                      inputMode="numeric"
                      autoComplete="cc-exp-month"
                      placeholder="MM"
                      maxLength={2}
                      value={expiryMonth}
                      onChange={(e) => setExpiryMonth(onlyDigits(e.target.value).slice(0, 2))}
                    />
                    <Input
                      label="Ano"
                      inputMode="numeric"
                      autoComplete="cc-exp-year"
                      placeholder="AAAA"
                      maxLength={4}
                      value={expiryYear}
                      onChange={(e) => setExpiryYear(onlyDigits(e.target.value).slice(0, 4))}
                    />
                    <Input
                      label="CVV"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="000"
                      maxLength={4}
                      value={ccv}
                      onChange={(e) => setCcv(onlyDigits(e.target.value).slice(0, 4))}
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 text-[13px] font-medium text-ink-secondary">
                  Dados do titular (cobrança)
                </div>
                <div className="space-y-3">
                  <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
                  <Input
                    label="E-mail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="CPF ou CNPJ"
                      value={formatDocument(cpfCnpj)}
                      onChange={(e) => setCpfCnpj(e.target.value)}
                    />
                    <Input
                      label="Telefone"
                      type="tel"
                      value={formatPhone(phone)}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="CEP"
                      value={formatCep(postalCode)}
                      onChange={(e) => setPostalCode(e.target.value)}
                    />
                    <Input
                      label="Número do endereço"
                      value={addressNumber}
                      onChange={(e) => setAddressNumber(e.target.value)}
                    />
                  </div>
                </div>
              </div>

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

              <p className="flex items-center justify-center gap-1.5 text-xs text-ink-tertiary">
                <ShieldCheck className="h-3.5 w-3.5" />
                Pagamento processado com segurança pelo Asaas.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
