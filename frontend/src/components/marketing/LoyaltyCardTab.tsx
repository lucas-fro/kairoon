import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Save, Stamp } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getLoyaltyProgram, saveLoyaltyProgram } from '../../api/loyalty'
import type { LoyaltyProgramPayload } from '../../api/loyalty'
import { listServices } from '../../api/services'
import { cn, formatBRL, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { LoyaltyRewardType } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { SkeletonList } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { useToast } from '../ui/Toast'
import { ServiceChecklist } from './ServiceChecklist'

const REWARD_OPTIONS: { key: LoyaltyRewardType; label: string }[] = [
  { key: 'percent', label: '%' },
  { key: 'fixed', label: 'R$' },
  { key: 'free_service', label: 'Grátis' },
]

export function LoyaltyCardTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['loyalty', 'program'], queryFn: getLoyaltyProgram })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })

  const [active, setActive] = useState(false)
  const [stamps, setStamps] = useState('10')
  // '' equivale a R$ 0,00 (qualquer valor carimba)
  const [minTicket, setMinTicket] = useState('')
  const [rewardType, setRewardType] = useState<LoyaltyRewardType>('percent')
  const [rewardValue, setRewardValue] = useState('')
  // vazio = qualquer serviço (rewardServiceIds null)
  const [rewardServiceIds, setRewardServiceIds] = useState<string[]>([])
  const [formErrors, setFormErrors] = useState<{ stamps?: string; reward?: string }>({})

  // Sincroniza o formulário quando o programa carrega (null = nunca configurado → defaults)
  useEffect(() => {
    const program = query.data
    if (program === undefined) return
    if (program) {
      setActive(program.active)
      setStamps(String(program.stampsRequired))
      setMinTicket(
        program.minTicketCents > 0
          ? (program.minTicketCents / 100).toFixed(2).replace('.', ',')
          : '',
      )
      setRewardType(program.rewardType)
      setRewardValue(
        program.rewardType === 'percent'
          ? String(program.rewardValue)
          : program.rewardType === 'fixed'
            ? (program.rewardValue / 100).toFixed(2).replace('.', ',')
            : '',
      )
      setRewardServiceIds(program.rewardServiceIds ?? [])
    } else {
      setActive(false)
      setStamps('10')
      setMinTicket('')
      setRewardType('percent')
      setRewardValue('')
      setRewardServiceIds([])
    }
    setFormErrors({})
  }, [query.data])

  const services = servicesQuery.data ?? []
  const activeServices = services.filter((s) => s.active)
  // Mantém serviços já selecionados na lista mesmo que tenham sido desativados
  const inactiveSelected = services.filter((s) => !s.active && rewardServiceIds.includes(s.id))
  const serviceOptions = [...activeServices, ...inactiveSelected]
  const selectedServiceNames = rewardServiceIds
    .map((rid) => services.find((s) => s.id === rid)?.name)
    .filter((name): name is string => Boolean(name))

  function toggleRewardService(rid: string) {
    setRewardServiceIds((prev) => (prev.includes(rid) ? prev.filter((x) => x !== rid) : [...prev, rid]))
  }

  const saveMutation = useMutation({
    mutationFn: saveLoyaltyProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loyalty'] })
      toast.success('Cartão fidelidade salvo!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  // Valores ao vivo para a frase de "Como funciona"
  const stampsCount = Number(stamps) || 0
  const minTicketCents = parseBRLToCents(minTicket)

  function describeReward(): string {
    if (rewardType === 'free_service') {
      if (selectedServiceNames.length === 0) return 'um serviço grátis (qualquer serviço)'
      if (selectedServiceNames.length === 1) return `1 ${selectedServiceNames[0]} grátis`
      return `1 serviço grátis entre: ${selectedServiceNames.join(', ')}`
    }
    if (rewardType === 'percent') {
      const pct = Number(onlyDigits(rewardValue)) || 0
      return `${pct}% de desconto no próximo atendimento`
    }
    return `${formatBRL(parseBRLToCents(rewardValue))} de desconto no próximo atendimento`
  }

  const howItWorks = `A cada atendimento concluído ${
    minTicketCents > 0 ? `de pelo menos ${formatBRL(minTicketCents)}` : '(qualquer valor)'
  } o cliente ganha 1 carimbo; com ${stampsCount} carimbo${
    stampsCount === 1 ? '' : 's'
  } ele resgata: ${describeReward()}.`

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const stampsRequired = Number(stamps) || 0
    const nextErrors: typeof formErrors = {}
    if (stampsRequired < 1) nextErrors.stamps = 'Informe pelo menos 1 carimbo'

    let value = 0
    if (rewardType === 'percent') {
      value = Math.min(Number(onlyDigits(rewardValue)) || 0, 100)
      if (value < 1) nextErrors.reward = 'Informe um desconto entre 1% e 100%'
    } else if (rewardType === 'fixed') {
      value = parseBRLToCents(rewardValue)
      if (value <= 0) nextErrors.reward = 'Informe um valor de desconto válido'
    }

    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: LoyaltyProgramPayload = {
      active,
      stampsRequired,
      minTicketCents,
      rewardType,
      rewardValue: value,
      rewardServiceIds:
        rewardType === 'free_service' && rewardServiceIds.length > 0 ? rewardServiceIds : null,
    }
    saveMutation.mutate(payload)
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-secondary">
        A cada atendimento elegível o cliente ganha 1 carimbo; ao completar o cartão, os carimbos
        viram um cupom pessoal com a recompensa configurada.
      </p>

      {query.isPending && <SkeletonList rows={4} />}

      {query.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">
              Não foi possível carregar o cartão fidelidade.
            </p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!query.isPending && !query.isError && (
        <div className="flex flex-col-reverse gap-6 xl:flex-row">
          <Card className="w-full flex-1">
            <CardHeader>
              <CardTitle>Configuração</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSubmit} className="max-w-2xl space-y-4" noValidate>
                <div className="flex items-center justify-between gap-4 rounded-lg bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-ink">
                      Cartão fidelidade{' '}
                      <span className={active ? 'text-success-dark' : 'text-ink-tertiary'}>
                        {active ? 'ativado' : 'desativado'}
                      </span>
                    </p>
                  </div>
                  <Switch checked={active} onChange={setActive} aria-label="Cartão fidelidade ativo" />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Carimbos necessários"
                    inputMode="numeric"
                    value={stamps}
                    onChange={(e) => setStamps(onlyDigits(e.target.value).slice(0, 3))}
                    placeholder="10"
                    error={formErrors.stamps}
                  />
                  <Input
                    label="Ticket mínimo para carimbar"
                    inputMode="decimal"
                    value={minTicket}
                    onChange={(e) => setMinTicket(e.target.value.replace(/[^\d,]/g, ''))}
                    placeholder="0,00"
                    hint="Deixe em branco (R$ 0,00) para carimbar qualquer valor."
                    leftIcon={<span className="text-sm">R$</span>}
                  />
                </div>

                <div>
                  <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                    Recompensa ao completar o cartão
                  </span>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex w-full gap-1 rounded-lg border border-line p-0.5 sm:inline-flex sm:w-auto sm:shrink-0">
                      {REWARD_OPTIONS.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setRewardType(key)
                            setRewardValue('')
                            setFormErrors((prev) => ({ ...prev, reward: undefined }))
                          }}
                          className={cn(
                            'flex flex-1 items-center justify-center rounded-md px-2 py-2 text-center text-xs font-medium leading-tight transition-colors sm:h-9 sm:flex-none sm:px-4 sm:py-0 sm:text-[13px]',
                            rewardType === key
                              ? 'bg-primary text-white'
                              : 'text-ink-secondary hover:text-ink',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {rewardType !== 'free_service' && (
                      <div className="min-w-0 flex-1">
                        <div className="relative">
                          {rewardType === 'fixed' && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                              R$
                            </span>
                          )}
                          <input
                            inputMode={rewardType === 'percent' ? 'numeric' : 'decimal'}
                            value={rewardValue}
                            aria-label={
                              rewardType === 'percent' ? 'Desconto em %' : 'Valor do desconto'
                            }
                            onChange={(e) => {
                              const v = e.target.value
                              if (rewardType === 'percent') {
                                const digits = onlyDigits(v).slice(0, 3)
                                setRewardValue(
                                  digits === '' ? '' : String(Math.min(Number(digits), 100)),
                                )
                              } else {
                                setRewardValue(v.replace(/[^\d,]/g, ''))
                              }
                            }}
                            placeholder={rewardType === 'percent' ? '10' : '0,00'}
                            className={cn(
                              'h-10 w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-ink-tertiary',
                              'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                              rewardType === 'fixed' ? 'pl-9 pr-3' : 'pl-3 pr-8',
                              formErrors.reward
                                ? 'border-error focus:border-error focus:ring-error-light'
                                : 'border-line focus:border-secondary focus:ring-secondary-light',
                            )}
                          />
                          {rewardType === 'percent' && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                              %
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {rewardType === 'free_service' && (
                    <div className="mt-3">
                      <p className="mb-1.5 text-[13px] font-medium text-ink-secondary">
                        Serviços que podem sair grátis
                      </p>
                      <ServiceChecklist
                        services={serviceOptions}
                        selected={rewardServiceIds}
                        onToggle={toggleRewardService}
                      />
                      <p className="mt-1.5 text-xs text-ink-tertiary">
                        Selecione um ou mais. Nenhum selecionado = qualquer serviço.
                      </p>
                    </div>
                  )}
                  {formErrors.reward && (
                    <p className="mt-1.5 text-xs text-error-dark">{formErrors.reward}</p>
                  )}
                </div>

                <p className="flex items-center gap-1.5 text-xs text-ink-tertiary">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Alterações no número de carimbos valem imediatamente para todos os clientes.
                </p>

                <div className="flex justify-end pt-1">
                  <Button
                    type="submit"
                    isLoading={saveMutation.isPending}
                    leftIcon={<Save className="h-4 w-4" />}
                  >
                    Salvar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="w-full flex-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stamp className="h-4 w-4 text-primary" />
                Como funciona
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3">
              <p className="text-sm text-ink-secondary">{howItWorks}</p>
              <p className="mt-2 text-xs text-ink-tertiary">
                O resgate é feito na página do cliente (Clientes → detalhe): ao completar o cartão,
                os carimbos são trocados por um cupom pessoal com a recompensa.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
