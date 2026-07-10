import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Check,
  Crown,
  Equal,
  Pencil,
  Percent,
  Plus,
  Power,
  Sparkles,
  Trash2,
  UserCircle,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from '../../api/employees'
import type { EmployeePayload } from '../../api/employees'
import { getPlan } from '../../api/establishment'
import { listServices } from '../../api/services'
import { WEEKDAY_LABELS_SHORT } from '../../lib/dates'
import { cn, formatBRL, formatPhone, onlyDigits, parseBRLToCents } from '../../lib/format'
import type { CommissionType, Employee } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import type { SelectMenuOption } from '../ui/SelectMenu'
import { SkeletonList } from '../ui/Skeleton'
import { Switch } from '../ui/Switch'
import { TBody, Table, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const UPGRADE_BENEFITS = [
  'Colaboradores ilimitados na sua equipe',
  'Agenda individual para cada profissional',
  'Relatórios completos de desempenho',
]

const STEPS = ['Dados', 'Jornada', 'Comissão', 'Remuneração']

const PAY_DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

const GENDER_OPTIONS: SelectMenuOption[] = [
  { value: '', label: 'Não informar' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
]

function getErrorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/** centavos → '1.234,56' */
function centsToBRL(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

/** parseBRLToCents seguro para campos vazios */
function toCents(value: string): number {
  return value.trim() ? parseBRLToCents(value) : 0
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0]
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return `${first}${last}`.toUpperCase()
}

/** Converte o texto digitado no campo de comissão para o valor armazenado */
function parseCommissionValue(raw: string, type: CommissionType): number {
  if (!raw.trim()) return 0
  if (type === 'percent') {
    const n = Number(raw.replace(/\D/g, ''))
    return Number.isFinite(n) ? Math.min(n, 100) : 0
  }
  return parseBRLToCents(raw)
}

interface FormState {
  name: string
  photoUrl: string
  email: string
  phone: string
  birthDate: string
  gender: string
  workStart: string
  workEnd: string
  lunchStart: string
  lunchEnd: string
  workDays: number[]
  applyToAll: boolean
  commissionEnabled: boolean
  commissionType: CommissionType
  applyCommissionToAll: boolean
  // Remuneração (folha) — valores em texto BRL
  salary: string
  bonuses: { label: string; value: string }[]
  vr: string
  vt: string
  va: string
  paymentMode: 'none' | 'single' | 'split'
  paymentDay1: string
  paymentAmount1: string
  paymentDay2: string
  paymentAmount2: string
}

const EMPTY_FORM: FormState = {
  name: '',
  photoUrl: '',
  email: '',
  phone: '',
  birthDate: '',
  gender: '',
  workStart: '09:00',
  workEnd: '18:00',
  lunchStart: '',
  lunchEnd: '',
  workDays: [1, 2, 3, 4, 5, 6],
  applyToAll: false,
  commissionEnabled: false,
  commissionType: 'percent',
  applyCommissionToAll: false,
  salary: '',
  bonuses: [],
  vr: '',
  vt: '',
  va: '',
  paymentMode: 'none',
  paymentDay1: '5',
  paymentAmount1: '',
  paymentDay2: '20',
  paymentAmount2: '',
}

export function EmployeesTab() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [step, setStep] = useState(1)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // serviceId → texto digitado no campo de comissão
  const [commissionValues, setCommissionValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<Employee | null>(null)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  const employeesQuery = useQuery({ queryKey: ['employees'], queryFn: listEmployees })
  const planQuery = useQuery({ queryKey: ['plan'], queryFn: getPlan })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })
  const services = servicesQuery.data ?? []

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['employees'] })
    queryClient.invalidateQueries({ queryKey: ['plan'] })
  }

  const saveMutation = useMutation({
    mutationFn: (input: { id?: string; data: EmployeePayload }) =>
      input.id ? updateEmployee(input.id, input.data) : createEmployee(input.data),
    onSuccess: (_result, input) => {
      invalidateAll()
      toast.success(input.id ? 'Profissional atualizado' : 'Profissional adicionado')
      closeDialog()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        closeDialog()
        setUpgradeOpen(true)
        return
      }
      setError(getErrorMessage(err))
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: (employee: Employee) => updateEmployee(employee.id, { active: !employee.active }),
    onSuccess: (updated) => {
      invalidateAll()
      toast.success(updated.active ? 'Profissional ativado' : 'Profissional desativado')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => {
      invalidateAll()
      toast.success('Profissional excluído')
      setDeleting(null)
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
      setDeleting(null)
    },
  })

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setCommissionValues({})
    setStep(1)
    setError(undefined)
    setDialogOpen(true)
  }

  function openEdit(employee: Employee) {
    setEditing(employee)
    setForm({
      name: employee.name,
      photoUrl: employee.photoUrl ?? '',
      email: employee.email ?? '',
      phone: formatPhone(employee.phone ?? ''),
      birthDate: employee.birthDate ?? '',
      gender: employee.gender ?? '',
      workStart: employee.workStart,
      workEnd: employee.workEnd,
      lunchStart: employee.lunchStart ?? '',
      lunchEnd: employee.lunchEnd ?? '',
      workDays: employee.workDays,
      applyToAll: false,
      commissionEnabled: employee.commissionEnabled,
      commissionType: employee.commissionType,
      applyCommissionToAll: false,
      salary: employee.salaryCents != null ? centsToBRL(employee.salaryCents) : '',
      bonuses: (employee.bonuses ?? []).map((b) => ({
        label: b.label,
        value: centsToBRL(b.amountCents),
      })),
      vr: employee.vrCents != null ? centsToBRL(employee.vrCents) : '',
      vt: employee.vtCents != null ? centsToBRL(employee.vtCents) : '',
      va: employee.vaCents != null ? centsToBRL(employee.vaCents) : '',
      paymentMode:
        (employee.paymentDays ?? []).length === 2
          ? 'split'
          : (employee.paymentDays ?? []).length === 1
            ? 'single'
            : 'none',
      paymentDay1: String(employee.paymentDays?.[0]?.day ?? 5),
      paymentAmount1: employee.paymentDays?.[0]
        ? centsToBRL(employee.paymentDays[0].amountCents)
        : '',
      paymentDay2: String(employee.paymentDays?.[1]?.day ?? 20),
      paymentAmount2: employee.paymentDays?.[1]
        ? centsToBRL(employee.paymentDays[1].amountCents)
        : '',
    })
    const values: Record<string, string> = {}
    for (const c of employee.commissions) {
      values[c.serviceId] =
        employee.commissionType === 'fixed'
          ? (c.value / 100).toFixed(2).replace('.', ',')
          : String(c.value)
    }
    setCommissionValues(values)
    setStep(1)
    setError(undefined)
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditing(null)
    setStep(1)
  }

  function handleAddClick() {
    const plan = planQuery.data
    const employees = employeesQuery.data ?? []
    if (plan && plan.plan === 'free' && employees.length >= plan.limits.employees) {
      setUpgradeOpen(true)
      return
    }
    openCreate()
  }

  function toggleDay(day: number) {
    setForm((f) => ({
      ...f,
      workDays: f.workDays.includes(day)
        ? f.workDays.filter((d) => d !== day)
        : [...f.workDays, day].sort((a, b) => a - b),
    }))
  }

  function setCommissionValue(serviceId: string, raw: string) {
    setCommissionValues((prev) => {
      let next = raw
      if (form.commissionType === 'percent') {
        const digits = raw.replace(/\D/g, '').slice(0, 3)
        next = digits === '' ? '' : String(Math.min(Number(digits), 100))
      } else {
        next = raw.replace(/[^\d,]/g, '')
      }
      return { ...prev, [serviceId]: next }
    })
  }

  /** Repete o valor de um serviço para todos os outros ("igual para todos") */
  function applyValueToAll(sourceServiceId: string) {
    const value = commissionValues[sourceServiceId] ?? ''
    setCommissionValues(() => {
      const next: Record<string, string> = {}
      for (const s of services) next[s.id] = value
      return next
    })
  }

  function nameError(): string | undefined {
    if (form.name.trim().length < 2) return 'Informe o nome do profissional'
  }

  function scheduleError(): string | undefined {
    if (form.workStart >= form.workEnd) return 'O horário de entrada deve ser anterior ao de saída'
    if ((form.lunchStart && !form.lunchEnd) || (!form.lunchStart && form.lunchEnd)) {
      return 'Informe início e fim do almoço, ou deixe ambos vazios'
    }
    if (form.lunchStart && form.lunchEnd && form.lunchStart >= form.lunchEnd) {
      return 'O início do almoço deve ser anterior ao fim'
    }
    if (form.workDays.length === 0) return 'Selecione ao menos um dia de trabalho'
  }

  /** Navegação livre pelo topo (clicando na etapa) */
  function goToStep(target: number) {
    setError(undefined)
    setStep(target)
  }

  function goToSchedule() {
    const err = nameError()
    if (err) {
      setError(err)
      return
    }
    setError(undefined)
    setStep(2)
  }

  function goToCommission() {
    const err = scheduleError()
    if (err) {
      setError(err)
      return
    }
    setError(undefined)
    setStep(3)
  }

  function goToPayroll() {
    setError(undefined)
    setStep(4)
  }

  /** Total mensal da folha (salário + bônus + VR + VT + VA), em centavos.
   * Só conta bônus com rótulo — igual ao que o handleSave persiste. */
  function payrollTotalCents(f: FormState): number {
    const bonuses = f.bonuses.reduce(
      (sum, b) => sum + (b.label.trim() ? toCents(b.value) : 0),
      0,
    )
    return toCents(f.salary) + bonuses + toCents(f.vr) + toCents(f.vt) + toCents(f.va)
  }

  function addBonus() {
    setForm((f) => ({ ...f, bonuses: [...f.bonuses, { label: '', value: '' }] }))
  }

  function removeBonus(index: number) {
    setForm((f) => ({ ...f, bonuses: f.bonuses.filter((_, i) => i !== index) }))
  }

  function setBonus(index: number, field: 'label' | 'value', value: string) {
    setForm((f) => ({
      ...f,
      bonuses: f.bonuses.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }))
  }

  /** Divide o total igualmente entre os dois dias */
  function presetSplitHalf() {
    setForm((f) => {
      const total = payrollTotalCents(f)
      const half = Math.floor(total / 2)
      return { ...f, paymentAmount1: centsToBRL(half), paymentAmount2: centsToBRL(total - half) }
    })
  }

  /** Bônus + benefícios no 1º dia; salário no 2º */
  function presetSplitBonusFirst() {
    setForm((f) => {
      const total = payrollTotalCents(f)
      const salary = toCents(f.salary)
      return {
        ...f,
        paymentAmount1: centsToBRL(total - salary),
        paymentAmount2: centsToBRL(salary),
      }
    })
  }

  /** Preço → comissão/percentual e quanto sobra, exibido abaixo de cada serviço */
  function commissionHint(priceCents: number, raw: string): string {
    const price = formatBRL(priceCents)
    const value = parseCommissionValue(raw, form.commissionType)
    if (value <= 0) return price
    if (form.commissionType === 'percent') {
      const commission = Math.round((priceCents * value) / 100)
      return `${price} → ${formatBRL(commission)} · sobra ${formatBRL(priceCents - commission)}`
    }
    const percent = priceCents > 0 ? Math.round((value / priceCents) * 100) : 0
    return `${price} → ${percent}% · sobra ${formatBRL(priceCents - value)}`
  }

  function handleSave() {
    const ne = nameError()
    if (ne) {
      setStep(1)
      setError(ne)
      return
    }
    const se = scheduleError()
    if (se) {
      setStep(2)
      setError(se)
      return
    }

    const commissions = services
      .map((s) => ({
        serviceId: s.id,
        value: parseCommissionValue(commissionValues[s.id] ?? '', form.commissionType),
      }))
      .filter((c) => c.value > 0)

    // Remuneração (folha)
    const bonuses = form.bonuses
      .map((b) => ({ label: b.label.trim(), amountCents: toCents(b.value) }))
      .filter((b) => b.label.length > 0 && b.amountCents > 0)

    let paymentDays: { day: number; amountCents: number }[] = []
    if (form.paymentMode === 'single') {
      paymentDays = [{ day: Number(form.paymentDay1), amountCents: payrollTotalCents(form) }]
    } else if (form.paymentMode === 'split') {
      if (form.paymentDay1 === form.paymentDay2) {
        setStep(4)
        setError('Os dois dias de pagamento devem ser diferentes')
        return
      }
      paymentDays = [
        { day: Number(form.paymentDay1), amountCents: toCents(form.paymentAmount1) },
        { day: Number(form.paymentDay2), amountCents: toCents(form.paymentAmount2) },
      ]
    }

    setError(undefined)
    saveMutation.mutate({
      id: editing?.id,
      data: {
        name: form.name.trim(),
        photoUrl: form.photoUrl.trim() || undefined,
        email: form.email.trim(),
        phone: onlyDigits(form.phone),
        birthDate: form.birthDate,
        gender: form.gender,
        workStart: form.workStart,
        workEnd: form.workEnd,
        lunchStart: form.lunchStart,
        lunchEnd: form.lunchEnd,
        workDays: form.workDays,
        applyScheduleToAll: form.applyToAll,
        commissionEnabled: form.commissionEnabled,
        commissionType: form.commissionType,
        commissions,
        applyCommissionToAll: form.commissionEnabled && form.applyCommissionToAll,
        salaryCents: form.salary.trim() ? parseBRLToCents(form.salary) : null,
        bonuses,
        vrCents: form.vr.trim() ? parseBRLToCents(form.vr) : null,
        vtCents: form.vt.trim() ? parseBRLToCents(form.vt) : null,
        vaCents: form.va.trim() ? parseBRLToCents(form.va) : null,
        paymentDays,
      },
    })
  }

  const employees = employeesQuery.data ?? []
  const plan = planQuery.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-sm text-ink-secondary">Profissionais que atendem no seu negócio.</p>
          {plan && (
            <Badge tone="brand">
              <Crown className="h-3 w-3" />
              {plan.limits.employees >= 90
                ? `${plan.usage.employees} ${plan.usage.employees === 1 ? 'profissional' : 'profissionais'}`
                : `${plan.usage.employees} de ${plan.limits.employees}`}
            </Badge>
          )}
        </div>
        <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleAddClick}>
          Adicionar colaborador
        </Button>
      </div>

      {employeesQuery.isPending ? (
        <Card>
          <div className="p-6">
            <SkeletonList rows={3} />
          </div>
        </Card>
      ) : employeesQuery.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-secondary">{getErrorMessage(employeesQuery.error)}</p>
          <Button variant="outline" className="mt-4" onClick={() => employeesQuery.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : employees.length === 0 ? (
        <EmptyState
          icon={UserCircle}
          title="Nenhum profissional cadastrado"
          description="Adicione os profissionais da sua equipe para que os clientes possam agendar com eles"
          action={
            <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleAddClick}>
              Adicionar colaborador
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Profissional</Th>
                <Th>Contato</Th>
                <Th>Jornada</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {employees.map((employee) => (
                <Tr key={employee.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      {employee.photoUrl ? (
                        <img
                          src={employee.photoUrl}
                          alt={employee.name}
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">
                          {getInitials(employee.name)}
                        </div>
                      )}
                      <span className="font-medium text-ink">{employee.name}</span>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-[13px]">
                      {employee.email && <p className="text-ink-secondary">{employee.email}</p>}
                      {employee.phone && (
                        <p className="text-ink-tertiary">{formatPhone(employee.phone)}</p>
                      )}
                      {!employee.email && !employee.phone && (
                        <span className="text-ink-tertiary">—</span>
                      )}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-[13px] text-ink-secondary">
                    {employee.workStart}–{employee.workEnd}
                  </Td>
                  <Td>
                    <Badge tone={employee.active ? 'success' : 'neutral'}>
                      {employee.active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(employee)}
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleActiveMutation.mutate(employee)}
                        isLoading={
                          toggleActiveMutation.isPending &&
                          toggleActiveMutation.variables?.id === employee.id
                        }
                        leftIcon={<Power className="h-3.5 w-3.5" />}
                      >
                        {/* largura fixa para 'Ativar'/'Desativar' alinharem entre linhas */}
                        <span className="w-[4.5rem] text-left">
                          {employee.active ? 'Desativar' : 'Ativar'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(employee)}
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

      {/* Dialog criar/editar em 3 etapas */}
      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editing ? 'Editar profissional' : 'Adicionar profissional'}
        maxWidth="max-w-lg"
      >
        {/* Etapas clicáveis: navegue direto por qualquer uma */}
        <div className="mb-5 flex items-stretch gap-2">
          {STEPS.map((label, i) => {
            const n = i + 1
            const active = n === step
            const done = n < step
            return (
              <button
                key={label}
                type="button"
                onClick={() => goToStep(n)}
                className="group flex flex-1 flex-col gap-1.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors',
                      active
                        ? 'bg-primary text-white'
                        : done
                          ? 'bg-primary/15 text-primary'
                          : 'bg-line-divider text-ink-tertiary group-hover:bg-line',
                    )}
                  >
                    {n}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[13px] font-medium transition-colors',
                      active ? 'text-ink' : 'text-ink-tertiary group-hover:text-ink-secondary',
                    )}
                  >
                    {label}
                  </span>
                </span>
                <span
                  className={cn(
                    'h-1 rounded-full transition-colors',
                    n <= step ? 'bg-primary' : 'bg-line-divider',
                  )}
                />
              </button>
            )
          })}
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <Input
              label="Nome"
              placeholder="Ex.: João Barbosa"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              autoFocus
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="E-mail (opcional)"
                type="email"
                placeholder="nome@email.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
              <Input
                label="Telefone (opcional)"
                type="tel"
                inputMode="numeric"
                placeholder="(11) 98765-4321"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Data de nascimento (opcional)"
                type="date"
                value={form.birthDate}
                onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
              />
              <SelectMenu
                label="Sexo (opcional)"
                value={form.gender}
                onChange={(v) => setForm((f) => ({ ...f, gender: v }))}
                options={GENDER_OPTIONS}
              />
            </div>
            <Input
              label="URL da foto (opcional)"
              type="url"
              placeholder="https://exemplo.com/foto.jpg"
              value={form.photoUrl}
              onChange={(e) => setForm((f) => ({ ...f, photoUrl: e.target.value }))}
            />

            {error && <p className="text-xs text-error-dark">{error}</p>}

            <DialogActions className="pt-2">
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="button" onClick={goToSchedule}>
                Próximo
              </Button>
            </DialogActions>
          </div>
        ) : step === 2 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Entrada"
                type="time"
                value={form.workStart}
                onChange={(e) => setForm((f) => ({ ...f, workStart: e.target.value }))}
              />
              <Input
                label="Saída"
                type="time"
                value={form.workEnd}
                onChange={(e) => setForm((f) => ({ ...f, workEnd: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Início do almoço"
                type="time"
                value={form.lunchStart}
                onChange={(e) => setForm((f) => ({ ...f, lunchStart: e.target.value }))}
              />
              <Input
                label="Fim do almoço"
                type="time"
                value={form.lunchEnd}
                onChange={(e) => setForm((f) => ({ ...f, lunchEnd: e.target.value }))}
              />
            </div>
            <div>
              <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                Dias de trabalho
              </span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS_SHORT.map((label, day) => {
                  const on = form.workDays.includes(day)
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={cn(
                        'h-9 w-12 rounded-lg border text-[13px] font-medium transition-colors',
                        on
                          ? 'border-primary bg-primary text-white'
                          : 'border-line text-ink-secondary hover:bg-surface-hover',
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-background p-3 text-sm text-ink-secondary">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-line accent-primary"
                checked={form.applyToAll}
                onChange={(e) => setForm((f) => ({ ...f, applyToAll: e.target.checked }))}
              />
              <span>
                Aplicar esta jornada a <strong>todos os profissionais</strong> ao salvar
              </span>
            </label>

            {error && <p className="text-xs text-error-dark">{error}</p>}

            <DialogActions className="pt-2">
              <Button
                type="button"
                variant="outline"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => {
                  setError(undefined)
                  setStep(1)
                }}
              >
                Voltar
              </Button>
              <Button type="button" onClick={goToCommission}>
                Próximo
              </Button>
            </DialogActions>
          </div>
        ) : step === 3 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-background p-3">
              <div>
                <p className="text-sm font-medium text-ink">Comissão por serviço</p>
                <p className="text-xs text-ink-tertiary">
                  Quanto o profissional recebe em cada atendimento.
                </p>
              </div>
              <Switch
                checked={form.commissionEnabled}
                onChange={(v) => setForm((f) => ({ ...f, commissionEnabled: v }))}
                aria-label="Ativar comissão"
              />
            </div>

            {form.commissionEnabled && (
              <>
                {/* Tipo: porcentagem ou valor fixo (centralizado) */}
                <div className="flex justify-center">
                  <div className="inline-flex rounded-lg border border-line p-0.5">
                    {(['percent', 'fixed'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, commissionType: type }))}
                        className={cn(
                          'inline-flex h-8 items-center gap-1.5 rounded-md px-4 text-[13px] font-medium transition-colors',
                          form.commissionType === type
                            ? 'bg-primary text-white'
                            : 'text-ink-secondary hover:text-ink',
                        )}
                      >
                        {type === 'percent' ? (
                          <Percent className="h-3.5 w-3.5" />
                        ) : (
                          <span className="text-xs font-semibold">R$</span>
                        )}
                        {type === 'percent' ? 'Porcentagem' : 'Valor fixo'}
                      </button>
                    ))}
                  </div>
                </div>

                {services.length === 0 ? (
                  <p className="rounded-lg bg-background px-3 py-4 text-center text-sm text-ink-tertiary">
                    Cadastre serviços primeiro para definir a comissão.
                  </p>
                ) : (
                  <div className="divide-y divide-line-divider overflow-hidden rounded-lg border border-line">
                    {services.map((service) => (
                      <div
                        key={service.id}
                        className="group flex items-center gap-2 px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{service.name}</p>
                          <p className="truncate text-[11px] leading-tight text-ink-tertiary">
                            {commissionHint(service.priceCents, commissionValues[service.id] ?? '')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyValueToAll(service.id)}
                          title="Aplicar este valor a todos os serviços"
                          className="hidden h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-ink-tertiary hover:bg-background hover:text-ink group-hover:inline-flex"
                        >
                          <Equal className="h-3.5 w-3.5" />
                          Igual p/ todos
                        </button>
                        <div className="relative w-28 shrink-0">
                          {form.commissionType === 'fixed' && (
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-tertiary">
                              R$
                            </span>
                          )}
                          <input
                            inputMode={form.commissionType === 'percent' ? 'numeric' : 'decimal'}
                            value={commissionValues[service.id] ?? ''}
                            onChange={(e) => setCommissionValue(service.id, e.target.value)}
                            placeholder={form.commissionType === 'percent' ? '0' : '0,00'}
                            className={cn(
                              'h-9 w-full rounded-lg border border-line bg-surface text-right text-sm text-ink placeholder:text-ink-tertiary',
                              'transition-shadow duration-150 focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light',
                              form.commissionType === 'fixed' ? 'pl-9 pr-3' : 'pl-3 pr-7',
                            )}
                          />
                          {form.commissionType === 'percent' && (
                            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-tertiary">
                              %
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-background p-3 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-line accent-primary"
                    checked={form.applyCommissionToAll}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, applyCommissionToAll: e.target.checked }))
                    }
                  />
                  <span>
                    Aplicar esta comissão a <strong>todos os profissionais</strong> ao salvar
                  </span>
                </label>
              </>
            )}

            {error && <p className="text-xs text-error-dark">{error}</p>}

            <DialogActions className="pt-2">
              <Button
                type="button"
                variant="outline"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => {
                  setError(undefined)
                  setStep(2)
                }}
              >
                Voltar
              </Button>
              <Button type="button" onClick={goToPayroll}>
                Próximo
              </Button>
            </DialogActions>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-ink-tertiary">
              Opcional. Usado na previsão de custos fixos e na futura folha salarial.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Salário base"
                inputMode="decimal"
                placeholder="2.000,00"
                leftIcon={<span className="text-sm">R$</span>}
                value={form.salary}
                onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input
                  label="VR"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.vr}
                  onChange={(e) => setForm((f) => ({ ...f, vr: e.target.value }))}
                />
                <Input
                  label="VT"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.vt}
                  onChange={(e) => setForm((f) => ({ ...f, vt: e.target.value }))}
                />
                <Input
                  label="VA"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={form.va}
                  onChange={(e) => setForm((f) => ({ ...f, va: e.target.value }))}
                />
              </div>
            </div>

            {/* Seção de bônus (repetível) */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-medium text-ink-secondary">Bônus</span>
                <button
                  type="button"
                  onClick={addBonus}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar bônus
                </button>
              </div>
              {form.bonuses.length === 0 ? (
                <p className="rounded-lg bg-background px-3 py-2.5 text-center text-xs text-ink-tertiary">
                  Nenhum bônus. Ex.: bônus de meta, ajuda de custo, insalubridade.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.bonuses.map((bonus, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Ex.: Bônus de meta"
                        value={bonus.label}
                        onChange={(e) => setBonus(index, 'label', e.target.value)}
                      />
                      <div className="w-32 shrink-0">
                        <Input
                          inputMode="decimal"
                          placeholder="0,00"
                          leftIcon={<span className="text-sm">R$</span>}
                          value={bonus.value}
                          onChange={(e) => setBonus(index, 'value', e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBonus(index)}
                        className="shrink-0 rounded-lg p-2 text-ink-tertiary hover:bg-error-light hover:text-error-dark"
                        aria-label="Remover bônus"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Total mensal */}
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2.5 text-sm">
              <span className="text-ink-secondary">Total mensal</span>
              <span className="font-semibold tabular-nums text-ink">
                {formatBRL(payrollTotalCents(form))}
              </span>
            </div>

            {/* Dias de pagamento */}
            <div>
              <span className="mb-2 block text-[13px] font-medium text-ink-secondary">
                Dias de pagamento
              </span>
              <div className="inline-flex rounded-lg border border-line p-0.5">
                {(
                  [
                    { key: 'none', label: 'Não lançar' },
                    { key: 'single', label: '1 dia' },
                    { key: 'split', label: '2 dias' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, paymentMode: option.key }))}
                    className={cn(
                      'h-8 rounded-md px-3 text-[13px] font-medium transition-colors',
                      form.paymentMode === option.key
                        ? 'bg-primary text-white'
                        : 'text-ink-secondary hover:text-ink',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {form.paymentMode === 'none' && (
                <p className="mt-2 text-xs text-ink-tertiary">
                  A folha fica registrada, mas não aparece na previsão de custos fixos.
                </p>
              )}

              {form.paymentMode === 'single' && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-secondary">Paga</span>
                  <span className="font-semibold text-ink">{formatBRL(payrollTotalCents(form))}</span>
                  <span className="text-ink-secondary">no dia</span>
                  <div className="w-24">
                    <SelectMenu
                      className="!h-9"
                      value={form.paymentDay1}
                      onChange={(v) => setForm((f) => ({ ...f, paymentDay1: v }))}
                      options={PAY_DAY_OPTIONS.map((day) => ({
                        value: String(day),
                        label: String(day),
                      }))}
                    />
                  </div>
                </div>
              )}

              {form.paymentMode === 'split' && (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={presetSplitHalf}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-surface-hover"
                    >
                      Metade em cada
                    </button>
                    <button
                      type="button"
                      onClick={presetSplitBonusFirst}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink-secondary hover:bg-surface-hover"
                    >
                      Bônus/benefícios no 1º, salário no 2º
                    </button>
                  </div>

                  {(
                    [
                      { dayKey: 'paymentDay1', amountKey: 'paymentAmount1', label: '1º pagamento' },
                      { dayKey: 'paymentDay2', amountKey: 'paymentAmount2', label: '2º pagamento' },
                    ] as const
                  ).map((row) => (
                    <div key={row.dayKey} className="flex items-end gap-2">
                      <div className="w-24 shrink-0">
                        <SelectMenu
                          label={row.label}
                          className="!h-9"
                          value={form[row.dayKey]}
                          onChange={(v) => setForm((f) => ({ ...f, [row.dayKey]: v }))}
                          options={PAY_DAY_OPTIONS.map((day) => ({
                            value: String(day),
                            label: `Dia ${day}`,
                          }))}
                        />
                      </div>
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        leftIcon={<span className="text-sm">R$</span>}
                        value={form[row.amountKey]}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [row.amountKey]: e.target.value }))
                        }
                      />
                    </div>
                  ))}

                  {(() => {
                    const sum = toCents(form.paymentAmount1) + toCents(form.paymentAmount2)
                    const total = payrollTotalCents(form)
                    if (total > 0 && sum !== total) {
                      return (
                        <p className="text-xs text-warning-dark">
                          A soma dos pagamentos ({formatBRL(sum)}) difere do total (
                          {formatBRL(total)}).
                        </p>
                      )
                    }
                    return null
                  })()}
                </div>
              )}
            </div>

            {error && <p className="text-xs text-error-dark">{error}</p>}

            <DialogActions className="pt-2">
              <Button
                type="button"
                variant="outline"
                leftIcon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => {
                  setError(undefined)
                  setStep(3)
                }}
                disabled={saveMutation.isPending}
              >
                Voltar
              </Button>
              <Button type="button" onClick={handleSave} isLoading={saveMutation.isPending}>
                {editing ? 'Salvar alterações' : 'Adicionar'}
              </Button>
            </DialogActions>
          </div>
        )}
      </Dialog>

      {/* Dialog de upgrade */}
      <Dialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} maxWidth="max-w-md">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-ink">Recurso do plano Pro</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            O plano Free permite 1 profissional. Faça upgrade para adicionar toda a sua equipe.
          </p>
        </div>
        <ul className="mt-6 space-y-2">
          {UPGRADE_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-ink-secondary">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" />
              {benefit}
            </li>
          ))}
        </ul>
        <DialogActions className="mt-6">
          <Button variant="outline" onClick={() => setUpgradeOpen(false)}>
            Agora não
          </Button>
          <Button onClick={() => navigate('/app/configuracoes?tab=plano')}>Conhecer planos</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id)
        }}
        title="Excluir profissional"
        description={
          deleting
            ? `Tem certeza que deseja excluir "${deleting.name}"? Essa ação não pode ser desfeita.`
            : undefined
        }
        confirmLabel="Excluir"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
