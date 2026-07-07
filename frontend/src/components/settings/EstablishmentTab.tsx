import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Copy, ExternalLink, Plus, Save, Search, Trash2, XCircle } from 'lucide-react'
import { ApiError } from '../../api/client'
import { checkSlugAvailability, updateEstablishment, updateSlug } from '../../api/establishment'
import { useAuth } from '../../contexts/AuthContext'
import { FixedCostsSection } from './FixedCostsSection'
import {
  formatCep,
  formatCnpj,
  formatPhone,
  isValidCep,
  isValidCnpj,
  isValidPhone,
  onlyDigits,
} from '../../lib/format'
import { fetchAddressByCep } from '../../lib/viacep'
import type { Establishment, PaymentSettings } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Spinner } from '../ui/Spinner'
import { Switch } from '../ui/Switch'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../ui/Toast'

const BUSINESS_TYPE_OPTIONS = [
  { value: 'barbearia', label: 'Barbearia' },
  { value: 'salao', label: 'Salão de beleza' },
  { value: 'clinica', label: 'Clínica' },
  { value: 'outro', label: 'Outro' },
]

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
type Availability = 'idle' | 'checking' | 'available' | 'taken'

const DEFAULT_PAYMENTS: PaymentSettings = {
  cash: true,
  pix: true,
  debit: true,
  credit: { enabled: true, brands: [] },
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
  const { user, setEstablishment } = useAuth()
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
  const [welcomeMessage, setWelcomeMessage] = useState(establishment.welcomeMessage ?? '')
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
  // usuário edita o CEP — não sobrescreve os dados salvos ao abrir a tela.
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
    slug.length > 0 && !isFormatValid ? 'Formato inválido (veja as regras abaixo)' : undefined

  const mutation = useMutation({
    mutationFn: updateEstablishment,
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Dados do estabelecimento atualizados!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  // Mensagem de boas-vindas do link público (salva sozinha, na seção do link)
  const welcomeMutation = useMutation({
    mutationFn: (value: string) => updateEstablishment({ welcomeMessage: value }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Mensagem de boas-vindas salva!')
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

  function addBrand() {
    setPayments((p) => ({
      ...p,
      credit: { ...p.credit, brands: [...p.credit.brands, { name: '', maxInstallments: 12 }] },
    }))
  }

  function updateBrand(index: number, patch: Partial<{ name: string; maxInstallments: number }>) {
    setPayments((p) => ({
      ...p,
      credit: {
        ...p.credit,
        brands: p.credit.brands.map((b, i) => (i === index ? { ...b, ...patch } : b)),
      },
    }))
  }

  function removeBrand(index: number) {
    setPayments((p) => ({
      ...p,
      credit: { ...p.credit, brands: p.credit.brands.filter((_, i) => i !== index) },
    }))
  }

  function handleSavePayments() {
    if (payments.credit.enabled && payments.credit.brands.some((b) => !b.name.trim())) {
      toast.error('Informe o nome de todas as bandeiras (ou remova as vazias)')
      return
    }
    const cleaned: PaymentSettings = {
      ...payments,
      credit: {
        ...payments.credit,
        brands: payments.credit.brands.map((b) => ({ ...b, name: b.name.trim() })),
      },
    }
    paymentsMutation.mutate(cleaned)
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

            {(user?.phone || user?.email) && (
              <button
                type="button"
                onClick={() => {
                  if (user?.phone) {
                    setPhone(formatPhone(user.phone))
                    setWhatsapp(formatPhone(user.phone))
                  }
                  if (user?.email) setEmail(user.email)
                }}
                className="-mt-1 text-xs font-medium text-secondary-hover hover:underline"
              >
                Usar meu telefone e e-mail pessoal como contato
              </button>
            )}

            {/* Linha 2 (PC): tipo de negócio, CNPJ, CEP */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select
                label="Tipo de negócio"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
              >
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
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

            <Input
              label="URL do logo (opcional)"
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
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
                  onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
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

          <p className="text-xs text-ink-tertiary">
            Permitido: letras minúsculas (a–z), números (0–9) e hífen (-) entre palavras. Não use
            espaços, acentos, letras maiúsculas ou caracteres especiais (ex.: @, ., /, _).
          </p>

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

          {/* Mensagem de boas-vindas exibida no topo do link público */}
          <div className="space-y-3 border-t border-line-divider pt-4">
            <Textarea
              label="Mensagem de boas-vindas"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="Ex.: Bem-vindo! Escolha um horário e até já."
              hint="Aparece no topo do seu link público."
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => welcomeMutation.mutate(welcomeMessage.trim())}
                isLoading={welcomeMutation.isPending}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Salvar mensagem
              </Button>
            </div>
          </div>

          {/* Confirmação de agendamentos do link público */}
          <div className="flex items-start justify-between gap-4 border-t border-line-divider pt-4">
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

          {/* Crédito com bandeiras e parcelas */}
          <div className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Crédito</p>
                <p className="mt-0.5 text-xs text-ink-tertiary">
                  Defina as bandeiras aceitas e em quantas vezes você parcela cada uma.
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
              <div className="space-y-2">
                {payments.credit.brands.length === 0 && (
                  <p className="rounded-lg bg-background px-3 py-3 text-center text-xs text-ink-tertiary">
                    Nenhuma bandeira adicionada ainda.
                  </p>
                )}
                {payments.credit.brands.map((brand, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Bandeira (ex.: Visa)"
                        value={brand.name}
                        onChange={(e) => updateBrand(index, { name: e.target.value })}
                      />
                    </div>
                    <div className="w-24 shrink-0">
                      <Select
                        aria-label="Máximo de parcelas"
                        value={String(brand.maxInstallments)}
                        onChange={(e) =>
                          updateBrand(index, { maxInstallments: Number(e.target.value) })
                        }
                      >
                        {INSTALLMENT_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}x
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="shrink-0 px-2 text-error-dark hover:bg-error-light hover:text-error-dark"
                      onClick={() => removeBrand(index)}
                      aria-label="Remover bandeira"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={addBrand}
                >
                  Adicionar bandeira
                </Button>
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
