import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Copy, ExternalLink, Save, Search, XCircle } from 'lucide-react'
import { ApiError } from '../../api/client'
import { checkSlugAvailability, updateEstablishment, updateSlug } from '../../api/establishment'
import { uploadImage } from '../../api/uploads'
import { useAuth } from '../../contexts/AuthContext'
import { FixedCostsSection } from './FixedCostsSection'
import {
  formatCep,
  formatCnpj,
  formatPhone,
  formatSlugInput,
  isValidCep,
  isValidCnpj,
  isValidPhone,
  onlyDigits,
} from '../../lib/format'
import { fetchAddressByCep } from '../../lib/viacep'
import type { Establishment, PaymentSettings } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { HelpTooltip } from '../ui/HelpTooltip'
import { ImageUploadField } from '../ui/ImageUploadField'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import type { SelectMenuOption } from '../ui/SelectMenu'
import { Spinner } from '../ui/Spinner'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'

const BUSINESS_TYPE_OPTIONS: SelectMenuOption[] = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'salao', label: 'Salão de beleza' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'outro', label: 'Outro' },
]

const RECEIPT_MODE_OPTIONS: SelectMenuOption[] = [
  { value: 'upfront', label: 'Adiantado' },
  { value: 'monthly', label: 'Mês a mês' },
]

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Availability = 'idle' | 'checking' | 'available' | 'taken'

const DEFAULT_PAYMENTS: PaymentSettings = {
  cash: true,
  pix: true,
  debit: true,
  credit: { enabled: true, maxInstallments: 12, receiptMode: 'upfront' },
}

const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)

const SIMPLE_METHODS: { key: 'cash' | 'pix' | 'debit'; label: string }[] = [
  { key: 'cash', label: 'Dinheiro' },
  { key: 'pix', label: 'PIX' },
  { key: 'debit', label: 'Débito' },
]

interface EstablishmentTabProps {
  establishment: Establishment
}

function stripHandle(value: string): string {
  return value.replace(/^@+/, '').replace(/\s/g, '')
}

export function EstablishmentTab({ establishment }: EstablishmentTabProps) {
  const { setEstablishment } = useAuth()
  const toast = useToast()

  // Dados
  const [name, setName] = useState(establishment.name)
  const [phone, setPhone] = useState(formatPhone(establishment.phone ?? ''))
  const [email, setEmail] = useState(establishment.email ?? '')
  const [businessType, setBusinessType] = useState<string>(establishment.businessType)
  const [document, setDocument] = useState(formatCnpj(establishment.document ?? ''))
  const [cep, setCep] = useState(formatCep(establishment.cep ?? ''))
  const [address, setAddress] = useState(establishment.address ?? '')
  const [addressNumber, setAddressNumber] = useState(establishment.addressNumber ?? '')
  const [neighborhood, setNeighborhood] = useState(establishment.neighborhood ?? '')
  const [city, setCity] = useState(establishment.city ?? '')
  const [uf, setUf] = useState(establishment.state ?? '')
  const [cepStatus, setCepStatus] = useState<'idle' | 'loading' | 'notfound'>('idle')
  const cepDirty = useRef(false)
  const [logoUrl, setLogoUrl] = useState(establishment.logoUrl ?? '')
  const [autoConfirm, setAutoConfirm] = useState(establishment.autoConfirm)

  // Redes sociais
  const [instagram, setInstagram] = useState(establishment.socials?.instagram ?? '')
  const [whatsapp, setWhatsapp] = useState(
    formatPhone(establishment.socials?.whatsapp ?? establishment.phone ?? ''),
  )

  // Formas de pagamento
  const [payments, setPayments] = useState<PaymentSettings>(
    establishment.paymentSettings ?? DEFAULT_PAYMENTS,
  )

  const [errors, setErrors] = useState<{
    name?: string
    phone?: string
    email?: string
    document?: string
    cep?: string
  }>({})

  // Autopreenchimento de endereço pelo CEP (ViaCEP). Só dispara quando o
  // usuário edita o CEP; não sobrescreve os dados salvos ao abrir a tela.
  useEffect(() => {
    if (!cepDirty.current) return
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

  // Link público
  const currentSlug = establishment.slug
  const [slug, setSlug] = useState(currentSlug)
  const [availability, setAvailability] = useState<Availability>('idle')
  const origin = window.location.origin
  const publicUrl = `${origin}/${currentSlug}`
  const isFormatValid = SLUG_REGEX.test(slug)
  const isSameAsCurrent = slug === currentSlug
  const slugFormatError =
    slug.length > 0 && !isFormatValid ? 'Formato inválido' : undefined

  const mutation = useMutation({
    mutationFn: updateEstablishment,
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Dados do estabelecimento atualizados!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const slugMutation = useMutation({
    mutationFn: updateSlug,
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Link público atualizado!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  // Salvo na hora ao alternar o switch
  const autoConfirmMutation = useMutation({
    mutationFn: (value: boolean) => updateEstablishment({ autoConfirm: value }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success(
        res.autoConfirm
          ? 'Agendamentos serão confirmados automaticamente'
          : 'Você aprovará cada agendamento',
      )
    },
    onError: (err) => {
      setAutoConfirm((v) => !v)
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
    },
  })

  function handleToggleAutoConfirm(value: boolean) {
    setAutoConfirm(value)
    autoConfirmMutation.mutate(value)
  }

  // Formas de pagamento
  const paymentsMutation = useMutation({
    mutationFn: (value: PaymentSettings) => updateEstablishment({ paymentSettings: value }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Formas de pagamento atualizadas!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  function handleSavePayments() {
    paymentsMutation.mutate(payments)
  }

  // Validação de disponibilidade do slug com debounce de 2 segundos
  useEffect(() => {
    if (isSameAsCurrent || !isFormatValid) {
      setAvailability('idle')
      return
    }
    setAvailability('checking')
    let cancelled = false
    const timer = setTimeout(() => {
      checkSlugAvailability(slug)
        .then((res) => {
          if (!cancelled) setAvailability(res.available ? 'available' : 'taken')
        })
        .catch(() => {
          if (!cancelled) setAvailability('idle')
        })
    }, 2000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [slug, isSameAsCurrent, isFormatValid])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Informe o nome do estabelecimento'
    if (phone.trim() && !isValidPhone(phone)) next.phone = 'Telefone inválido'
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) next.email = 'E-mail inválido'
    if (document.trim() && !isValidCnpj(document)) next.document = 'CNPJ inválido'
    if (cep.trim() && !isValidCep(cep)) next.cep = 'CEP inválido'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    mutation.mutate({
      name: name.trim(),
      phone: onlyDigits(phone),
      email: email.trim(),
      businessType,
      document: document.trim(),
      cep: cep.trim(),
      address: address.trim(),
      addressNumber: addressNumber.trim(),
      neighborhood: neighborhood.trim(),
      city: city.trim(),
      state: uf.trim(),
      logoUrl: logoUrl.trim(),
      socials: {
        instagram: instagram.trim() || undefined,
        whatsapp: onlyDigits(whatsapp) || undefined,
      },
    })
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(publicUrl)
      toast.success('Link copiado!')
    } catch {
      toast.error('Não foi possível copiar o link')
    }
  }

  function handleSaveSlug() {
    if (!isFormatValid || isSameAsCurrent || availability !== 'available') return
    slugMutation.mutate(slug)
  }

  return (
    <div className="space-y-6">
      {/* Dados + redes sociais */}
      <Card>
        <CardHeader>
          <CardTitle>Dados do estabelecimento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Linha 1 (PC): nome, telefone, e-mail */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Input
                label="Nome"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Barbearia do Zé"
                error={errors.name}
              />
              <Input
                label="Telefone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="(11) 98765-4321"
                error={errors.phone}
              />
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contato@exemplo.com"
                error={errors.email}
              />
            </div>

            {/* Linha 2 (PC): tipo de negócio, CNPJ, CEP */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SelectMenu
                label="Tipo de negócio"
                value={businessType}
                onChange={setBusinessType}
                options={BUSINESS_TYPE_OPTIONS}
              />
              <Input
                label="CNPJ"
                inputMode="numeric"
                value={document}
                onChange={(e) => setDocument(formatCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                error={errors.document}
              />
              <Input
                label="CEP"
                inputMode="numeric"
                leftIcon={<Search className="h-4 w-4" />}
                value={cep}
                onChange={(e) => {
                  cepDirty.current = true
                  setCep(formatCep(e.target.value))
                }}
                placeholder="00000-000"
                error={errors.cep ?? (cepStatus === 'notfound' ? 'CEP não encontrado' : undefined)}
                hint={
                  cepStatus === 'loading'
                    ? 'Buscando endereço…'
                    : 'Preenche o endereço automaticamente'
                }
              />
            </div>

            {/* Linha 3 (PC): endereço, número, bairro, cidade, UF */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_0.6fr_1.1fr_1.1fr_0.5fr]">
              <Input
                label="Endereço"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Rua, avenida…"
              />
              <Input
                label="Número"
                value={addressNumber}
                onChange={(e) => setAddressNumber(e.target.value)}
                placeholder="Nº"
              />
              <Input
                label="Bairro"
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Bairro"
              />
              <Input
                label="Cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cidade"
              />
              <Input
                label="Estado"
                value={uf}
                onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="UF"
              />
            </div>

            <ImageUploadField
              label="Logo do estabelecimento (opcional)"
              hint="PNG, JPG ou WEBP, até 5 MB. Aparece no link público e na barra lateral."
              value={logoUrl || null}
              name={name || establishment.name}
              variant="circle"
              onUpload={async (file) => {
                const { url } = await uploadImage('logo', file, logoUrl || null)
                setLogoUrl(url)
                const res = await updateEstablishment({ logoUrl: url })
                setEstablishment(res)
                toast.success('Logo atualizado!')
              }}
              onRemove={async () => {
                setLogoUrl('')
                const res = await updateEstablishment({ logoUrl: '' })
                setEstablishment(res)
                toast.success('Logo removido')
              }}
            />

            {/* Redes sociais */}
            <div className="border-t border-line-divider pt-4">
              <p className="mb-3 text-[13px] font-medium text-ink-secondary">Redes sociais</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Instagram"
                  placeholder="@usuario"
                  leftIcon={<img src="/instagram.svg" alt="" className="h-4 w-4" />}
                  value={instagram}
                  onChange={(e) => setInstagram(stripHandle(e.target.value))}
                />
                <Input
                  label="WhatsApp"
                  type="tel"
                  inputMode="numeric"
                  placeholder="(11) 98765-4321"
                  leftIcon={<img src="/whatsapp.svg" alt="" className="h-4 w-4" />}
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" isLoading={mutation.isPending} leftIcon={<Save className="h-4 w-4" />}>
                Salvar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Link público */}
      <Card>
        <CardHeader>
          <CardTitle>Link público de agendamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-background px-3 py-2">
              <span className="shrink-0 text-sm font-medium text-secondary-hover">{origin}/</span>
              <div className="relative min-w-0 flex-1">
                <input
                  aria-label="Link do estabelecimento"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  value={slug}
                  onChange={(e) => setSlug(formatSlugInput(e.target.value))}
                  placeholder="minha-barbearia"
                  className="h-8 w-full min-w-0 rounded-md border border-line bg-surface px-2 pr-8 text-sm text-ink placeholder:text-ink-tertiary focus:border-secondary focus:outline-none focus:ring-[2px] focus:ring-secondary-light"
                />
                {availability === 'checking' && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2">
                    <Spinner className="h-4 w-4" />
                  </span>
                )}
                {availability === 'available' && (
                  <CheckCircle2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-success-dark" />
                )}
                {availability === 'taken' && (
                  <XCircle className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-error-dark" />
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                leftIcon={<Copy className="h-4 w-4" />}
              >
                Copiar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(publicUrl, '_blank', 'noopener,noreferrer')}
                leftIcon={<ExternalLink className="h-4 w-4" />}
              >
                Abrir
              </Button>
            </div>
          </div>

          {slugFormatError ? (
            <p className="text-xs text-error-dark">{slugFormatError}</p>
          ) : availability === 'taken' ? (
            <p className="text-xs font-medium text-error-dark">Este link já está em uso.</p>
          ) : availability === 'available' ? (
            <p className="text-xs font-medium text-success-dark">Link disponível!</p>
          ) : null}

          {!isSameAsCurrent && isFormatValid && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleSaveSlug}
                isLoading={slugMutation.isPending}
                disabled={availability !== 'available'}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Salvar link
              </Button>
            </div>
          )}

          {/* Confirmação de agendamentos do link público */}
          <div className="flex items-center justify-between gap-4 border-t border-line-divider pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                Confirmar agendamentos automaticamente
              </p>
              <p className="mt-0.5 text-xs text-ink-tertiary">
                Ligado: as reservas do link público já entram confirmadas. Desligado: você aprova
                cada uma e recebe um aviso em tempo real.
              </p>
            </div>
            <Switch
              checked={autoConfirm}
              onChange={handleToggleAutoConfirm}
              disabled={autoConfirmMutation.isPending}
              aria-label="Confirmar agendamentos automaticamente"
            />
          </div>
        </CardContent>
      </Card>

      {/* Formas de pagamento */}
      <Card>
        <CardHeader>
          <CardTitle>Formas de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-ink-secondary">
            Escolha o que você aceita no fechamento dos atendimentos.
          </p>

          <div className="space-y-2">
            {SIMPLE_METHODS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-line px-4 py-3"
              >
                <span className="text-sm font-medium text-ink">{label}</span>
                <Switch
                  checked={payments[key]}
                  onChange={(value) => setPayments((p) => ({ ...p, [key]: value }))}
                  aria-label={label}
                />
              </div>
            ))}
          </div>

          {/* Crédito com parcelamento */}
          <div className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Crédito</p>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  Aceitar cartão de crédito no fechamento dos atendimentos.
                </p>
              </div>
              <Switch
                checked={payments.credit.enabled}
                onChange={(value) =>
                  setPayments((p) => ({ ...p, credit: { ...p.credit, enabled: value } }))
                }
                aria-label="Aceitar crédito"
              />
            </div>

            {payments.credit.enabled && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-medium text-ink">Máximo de parcelas</p>
                <div className="w-24 shrink-0">
                  <SelectMenu
                    ariaLabel="Máximo de parcelas"
                    value={String(payments.credit.maxInstallments)}
                    onChange={(v) =>
                      setPayments((p) => ({
                        ...p,
                        credit: { ...p.credit, maxInstallments: Number(v) },
                      }))
                    }
                    options={INSTALLMENT_OPTIONS.map((n) => ({
                      value: String(n),
                      label: `${n}x`,
                    }))}
                  />
                </div>
              </div>
            )}

            {payments.credit.enabled && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="text-sm font-medium text-ink">Recebimento</p>
                  <HelpTooltip label="Depende da sua maquininha, não do Kairoon: se ela antecipa e cai tudo de uma vez, use Adiantado; se ela repassa parcela por parcela, use Mês a mês. O financeiro lança o recebimento igual ao que você recebe." />
                </div>
                <div className="w-32 shrink-0">
                  <SelectMenu
                    ariaLabel="Recebimento do crédito"
                    value={payments.credit.receiptMode ?? 'upfront'}
                    onChange={(v) =>
                      setPayments((p) => ({
                        ...p,
                        credit: {
                          ...p.credit,
                          receiptMode: v as 'upfront' | 'monthly',
                        },
                      }))
                    }
                    options={RECEIPT_MODE_OPTIONS}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSavePayments}
              isLoading={paymentsMutation.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Salvar formas de pagamento
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Custos fixos (despesas recorrentes) */}
      <FixedCostsSection />
    </div>
  )
}
