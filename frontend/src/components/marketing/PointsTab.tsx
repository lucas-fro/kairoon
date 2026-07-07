import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Gift, Pencil, Plus, Power, Star, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  createPointsReward,
  deletePointsReward,
  getPointsProgram,
  listPointsRewards,
  savePointsProgram,
  updatePointsReward,
} from '../../api/points'
import type { PointsRewardPayload } from '../../api/points'
import { listServices } from '../../api/services'
import { describeCouponDiscount } from '../../lib/coupons'
import { cn, formatBRL, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { CouponDiscountType, PointsReward } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SkeletonList } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const REWARD_TYPES: { key: CouponDiscountType; label: string }[] = [
  { key: 'percent', label: '%' },
  { key: 'fixed', label: 'R$' },
  { key: 'free_service', label: 'Grátis' },
]

export function PointsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const programQuery = useQuery({ queryKey: ['points', 'program'], queryFn: getPointsProgram })
  const rewardsQuery = useQuery({ queryKey: ['points', 'rewards'], queryFn: listPointsRewards })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })

  // ----- Programa -----
  const [programActive, setProgramActive] = useState(false)
  const [pointsPerService, setPointsPerService] = useState('0')
  const [pointsPerCurrencyUnit, setPointsPerCurrencyUnit] = useState('0')

  // null = programa ainda não configurado → defaults zerados
  useEffect(() => {
    const program = programQuery.data
    setProgramActive(program?.active ?? false)
    setPointsPerService(String(program?.pointsPerService ?? 0))
    setPointsPerCurrencyUnit(String(program?.pointsPerCurrencyUnit ?? 0))
  }, [programQuery.data])

  const saveProgramMutation = useMutation({
    mutationFn: savePointsProgram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points'] })
      toast.success('Programa de pontos salvo!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  function handleSaveProgram() {
    saveProgramMutation.mutate({
      active: programActive,
      pointsPerService: Number(pointsPerService) || 0,
      pointsPerCurrencyUnit: Number(pointsPerCurrencyUnit) || 0,
    })
  }

  // ----- Recompensas -----
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PointsReward | null>(null)
  const [name, setName] = useState('')
  const [costPoints, setCostPoints] = useState('')
  const [rewardType, setRewardType] = useState<CouponDiscountType>('percent')
  const [rewardValue, setRewardValue] = useState('')
  // '' = qualquer serviço (só para tipo 'Grátis')
  const [rewardServiceId, setRewardServiceId] = useState('')
  const [formErrors, setFormErrors] = useState<{ name?: string; points?: string; value?: string }>(
    {},
  )
  const [deleteTarget, setDeleteTarget] = useState<PointsReward | null>(null)

  const rewards = rewardsQuery.data ?? []
  const services = servicesQuery.data ?? []
  const serviceById = new Map(services.map((s) => [s.id, s]))
  // Mantém o serviço da recompensa em edição mesmo se ele estiver inativo
  const serviceOptions = services.filter((s) => s.active || s.id === rewardServiceId)

  function resetForm() {
    setName('')
    setCostPoints('')
    setRewardType('percent')
    setRewardValue('')
    setRewardServiceId('')
    setFormErrors({})
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(reward: PointsReward) {
    setEditing(reward)
    setName(reward.name)
    setCostPoints(String(reward.costPoints))
    setRewardType(reward.rewardType)
    if (reward.rewardType === 'percent') setRewardValue(String(reward.rewardValue))
    else if (reward.rewardType === 'fixed') {
      setRewardValue((reward.rewardValue / 100).toFixed(2).replace('.', ','))
    } else setRewardValue('')
    setRewardServiceId(reward.rewardType === 'free_service' ? (reward.rewardServiceId ?? '') : '')
    setFormErrors({})
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: createPointsReward,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points'] })
      toast.success('Recompensa criada!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PointsRewardPayload }) =>
      updatePointsReward(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points'] })
      toast.success('Recompensa atualizada!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const toggleMutation = useMutation({
    mutationFn: (reward: PointsReward) =>
      updatePointsReward(reward.id, {
        name: reward.name,
        costPoints: reward.costPoints,
        rewardType: reward.rewardType,
        rewardValue: reward.rewardValue,
        rewardServiceId: reward.rewardServiceId,
        active: !reward.active,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['points'] })
      toast.success(updated.active ? 'Recompensa ativada!' : 'Recompensa desativada.')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePointsReward(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['points'] })
      toast.success('Recompensa excluída.')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
      setDeleteTarget(null)
    },
  })

  function handleSubmitReward(event: FormEvent) {
    event.preventDefault()

    const points = Number(costPoints) || 0
    const percentValue = Math.min(Number(onlyDigits(rewardValue)) || 0, 100)
    const fixedCents = parseBRLToCents(rewardValue)

    const nextErrors: typeof formErrors = {}
    if (!name.trim()) nextErrors.name = 'Informe o nome da recompensa'
    if (points < 1) nextErrors.points = 'Informe pelo menos 1 ponto'
    if (rewardType === 'percent' && percentValue <= 0) {
      nextErrors.value = 'Informe um percentual válido (1 a 100)'
    }
    if (rewardType === 'fixed' && fixedCents <= 0) nextErrors.value = 'Informe um valor válido'
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const payload: PointsRewardPayload = {
      name: name.trim(),
      costPoints: points,
      rewardType,
    }
    if (rewardType === 'percent') {
      payload.rewardValue = percentValue
      payload.rewardServiceId = null
    } else if (rewardType === 'fixed') {
      payload.rewardValue = fixedCents
      payload.rewardServiceId = null
    } else {
      payload.rewardServiceId = rewardServiceId === '' ? null : rewardServiceId
    }
    if (editing) {
      payload.active = editing.active
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSavingReward = createMutation.isPending || updateMutation.isPending

  // Prévia legível do resgate no dialog: "300 pontos = R$ 20,00 de desconto"
  const previewPoints = Number(costPoints) || 0
  const previewPrize = (() => {
    if (rewardType === 'percent') {
      const pct = Math.min(Number(onlyDigits(rewardValue)) || 0, 100)
      return `${pct}% de desconto`
    }
    if (rewardType === 'fixed') return `${formatBRL(parseBRLToCents(rewardValue))} de desconto`
    const service = rewardServiceId ? serviceById.get(rewardServiceId) : undefined
    return service ? `${service.name} grátis` : 'um serviço grátis (qualquer serviço)'
  })()

  function prizeSubtext(reward: PointsReward): string | null {
    if (reward.rewardType !== 'free_service') return null
    if (!reward.rewardServiceId) return 'Qualquer serviço'
    return serviceById.get(reward.rewardServiceId)?.name ?? 'Serviço removido'
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-secondary">
        Clientes acumulam pontos a cada atendimento e trocam por recompensas. O resgate é feito na
        página do cliente e vira um cupom de uso único.
      </p>

      {/* ----- Programa ----- */}
      {programQuery.isPending && <SkeletonList rows={2} />}

      {programQuery.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">
              Não foi possível carregar o programa de pontos.
            </p>
            <Button variant="outline" size="sm" onClick={() => programQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!programQuery.isPending && !programQuery.isError && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" /> Programa
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 rounded-lg bg-background px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Programa de pontos ativo</p>
                <p className="text-xs text-ink-tertiary">
                  Com o programa ativo, cada atendimento concluído gera pontos para o cliente.
                </p>
              </div>
              <Switch
                checked={programActive}
                onChange={setProgramActive}
                aria-label="Programa de pontos ativo"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Pontos por atendimento concluído"
                inputMode="numeric"
                value={pointsPerService}
                onChange={(e) => setPointsPerService(onlyDigits(e.target.value).slice(0, 5))}
                placeholder="0"
              />
              <Input
                label="Pontos por R$ 1 gasto"
                inputMode="numeric"
                value={pointsPerCurrencyUnit}
                onChange={(e) => setPointsPerCurrencyUnit(onlyDigits(e.target.value).slice(0, 5))}
                placeholder="0"
                hint="Calculado sobre o valor final pago pelo cliente."
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProgram} isLoading={saveProgramMutation.isPending}>
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ----- Recompensas ----- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-base font-semibold text-ink">Recompensas</h3>
          <p className="text-sm text-ink-secondary">
            Níveis de resgate: quantos pontos valem cada prêmio.
          </p>
        </div>
        <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
          Nova recompensa
        </Button>
      </div>

      {rewardsQuery.isPending && <SkeletonList rows={3} />}

      {rewardsQuery.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar as recompensas.</p>
            <Button variant="outline" size="sm" onClick={() => rewardsQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!rewardsQuery.isPending && !rewardsQuery.isError && rewards.length === 0 && (
        <EmptyState
          icon={Gift}
          title="Nenhuma recompensa cadastrada"
          description="Crie níveis de resgate para os pontos — por exemplo: 300 pontos = R$ 20 de desconto."
          action={
            <Button onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
              Nova recompensa
            </Button>
          }
        />
      )}

      {!rewardsQuery.isPending && !rewardsQuery.isError && rewards.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Recompensa</Th>
                <Th>Pontos</Th>
                <Th>Prêmio</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {rewards.map((reward) => (
                <Tr key={reward.id}>
                  <Td className="font-medium text-ink">{reward.name}</Td>
                  <Td>{reward.costPoints} pts</Td>
                  <Td>
                    <span className="text-ink">
                      {describeCouponDiscount(reward.rewardType, reward.rewardValue)}
                    </span>
                    {prizeSubtext(reward) && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">{prizeSubtext(reward)}</p>
                    )}
                  </Td>
                  <Td>
                    {reward.active ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Inativo</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(reward)}
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate(reward)}
                        isLoading={
                          toggleMutation.isPending && toggleMutation.variables?.id === reward.id
                        }
                        leftIcon={<Power className="h-3.5 w-3.5" />}
                      >
                        <span className="w-[4.5rem] text-left">
                          {reward.active ? 'Desativar' : 'Ativar'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(reward)}
                        className="text-error-dark hover:bg-error-light hover:text-error-dark"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Excluir
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar recompensa' : 'Nova recompensa'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmitReward} className="space-y-4" noValidate>
          <Input
            label="Nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: R$ 20 de desconto"
            error={formErrors.name}
          />

          <Input
            label="Pontos necessários"
            inputMode="numeric"
            value={costPoints}
            onChange={(e) => setCostPoints(onlyDigits(e.target.value).slice(0, 6))}
            placeholder="300"
            error={formErrors.points}
          />

          <div>
            <span className="mb-2 block text-[13px] font-medium text-ink-secondary">Prêmio</span>
            <div className="flex gap-2">
              <div className="inline-flex shrink-0 rounded-lg border border-line p-0.5">
                {REWARD_TYPES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setRewardType(key)
                      setRewardValue('')
                      setFormErrors((prev) => ({ ...prev, value: undefined }))
                    }}
                    className={cn(
                      'h-9 rounded-md px-3 text-[13px] font-medium transition-colors',
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
                <div className="relative flex-1">
                  {rewardType === 'fixed' && (
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                      R$
                    </span>
                  )}
                  <input
                    inputMode={rewardType === 'percent' ? 'numeric' : 'decimal'}
                    value={rewardValue}
                    onChange={(e) => {
                      const v = e.target.value
                      if (rewardType === 'percent') {
                        const digits = onlyDigits(v).slice(0, 3)
                        setRewardValue(digits === '' ? '' : String(Math.min(Number(digits), 100)))
                      } else {
                        setRewardValue(v.replace(/[^\d,]/g, ''))
                      }
                    }}
                    placeholder={rewardType === 'percent' ? '0' : '0,00'}
                    className={cn(
                      'h-10 w-full rounded-lg border bg-surface text-sm text-ink placeholder:text-ink-tertiary',
                      'transition-shadow duration-150 focus:outline-none focus:ring-[3px]',
                      formErrors.value
                        ? 'border-error focus:border-error focus:ring-error-light'
                        : 'border-line focus:border-secondary focus:ring-secondary-light',
                      rewardType === 'fixed' ? 'pl-9 pr-3' : 'pl-3 pr-8',
                    )}
                  />
                  {rewardType === 'percent' && (
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-tertiary">
                      %
                    </span>
                  )}
                </div>
              )}
            </div>
            {formErrors.value && <p className="mt-1.5 text-xs text-error-dark">{formErrors.value}</p>}
          </div>

          {rewardType === 'free_service' && (
            <Select
              label="Serviço grátis"
              value={rewardServiceId}
              onChange={(e) => setRewardServiceId(e.target.value)}
            >
              <option value="">Qualquer serviço</option>
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {formatBRL(service.priceCents)}
                </option>
              ))}
            </Select>
          )}

          {/* Prévia do nível de resgate */}
          <div className="rounded-lg bg-background p-3 text-sm text-ink-secondary">
            <span className="font-medium text-ink">
              {previewPoints} {previewPoints === 1 ? 'ponto' : 'pontos'}
            </span>{' '}
            = {previewPrize}
          </div>

          <p className="text-xs text-ink-tertiary">
            O resgate é feito na página do cliente e vira um cupom de uso único.
          </p>

          <DialogActions className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSavingReward}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSavingReward}>
              {editing ? 'Salvar' : 'Criar recompensa'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
        title="Excluir recompensa?"
        description={
          deleteTarget
            ? `A recompensa "${deleteTarget.name}" será removida permanentemente. Se preferir pausar novos resgates, desative-a.`
            : undefined
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
