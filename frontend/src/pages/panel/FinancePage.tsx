import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  Check,
  Percent,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import { ApiError } from '../../api/client'
import { getCommissionsReport } from '../../api/commissions'
import {
  getRecurringExpensesForecast,
  settlePayroll,
  settleRecurringExpense,
} from '../../api/recurringExpenses'
import { createTransaction, deleteTransaction, listTransactions } from '../../api/transactions'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { DialogActions } from '../../components/ui/DialogActions'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton, SkeletonList } from '../../components/ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { addDays, todayStr } from '../../lib/dates'
import { cn, formatBRL, formatDate, formatMonthLabel, parseBRLToCents } from '../../lib/format'
import type { LucideIcon } from 'lucide-react'
import type { RecurringExpenseForecastItem, Transaction, TransactionType } from '../../types/api'

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

interface NewTransactionForm {
  type: TransactionType
  description: string
  amount: string
  date: string
}

function emptyForm(): NewTransactionForm {
  return { type: 'income', description: '', amount: '', date: todayStr() }
}

function StatCard({
  label,
  icon: Icon,
  value,
  valueClassName,
}: {
  label: string
  icon: LucideIcon
  value: string
  valueClassName: string
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium text-ink-secondary">{label}</p>
        <Icon className="h-[18px] w-[18px] text-ink-tertiary" strokeWidth={1.9} />
      </div>
      <p className={cn('mt-2 font-display text-[28px] font-bold leading-tight tabular-nums', valueClassName)}>
        {value}
      </p>
    </Card>
  )
}

/**
 * Comissões apuradas no período, agregadas por profissional. Consulta própria
 * (independente do fluxo de caixa) usando o mesmo intervalo de datas da página.
 */
function CommissionsSection({ from, to }: { from: string; to: string }) {
  const query = useQuery({
    queryKey: ['commissions', from, to],
    queryFn: () => getCommissionsReport({ from, to }),
    placeholderData: keepPreviousData,
  })

  const report = query.data

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <Percent className="h-[18px] w-[18px] text-ink-tertiary" strokeWidth={1.9} />
        <h2 className="font-display text-lg font-bold text-ink">Comissões</h2>
      </div>

      {query.isPending ? (
        <SkeletonList rows={4} />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-secondary">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : !report || report.byEmployee.length === 0 ? (
        <EmptyState
          icon={Percent}
          title="Nenhuma comissão no período"
          description="Atendimentos concluídos de profissionais com comissão configurada aparecem aqui."
        />
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
            <p className="text-[13px] text-ink-secondary">
              {report.summary.count}{' '}
              {report.summary.count === 1 ? 'atendimento comissionado' : 'atendimentos comissionados'}
            </p>
            <p className="text-sm text-ink-secondary">
              Total a pagar:{' '}
              <span className="font-semibold tabular-nums text-ink">
                {formatBRL(report.summary.totalCents)}
              </span>
            </p>
          </div>
          <Table>
            <THead>
              <tr>
                <Th>Profissional</Th>
                <Th className="w-32 text-right">Atendimentos</Th>
                <Th className="w-40 text-right">Base</Th>
                <Th className="w-40 text-right">Comissão</Th>
              </tr>
            </THead>
            <TBody>
              {report.byEmployee.map((row) => (
                <Tr key={row.employeeId}>
                  <Td className="font-medium text-ink">{row.employeeName}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-ink-secondary">
                    {row.count}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-ink-secondary">
                    {formatBRL(row.baseCents)}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <span className="font-semibold tabular-nums text-ink">
                      {formatBRL(row.commissionCents)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </section>
  )
}

/**
 * Previsão dos custos fixos do mês selecionado: total previsto, já pago e a
 * pagar, com botão de "dar baixa" que lança a saída no fluxo de caixa. O mês é
 * derivado do início do período filtrado na página.
 */
function FixedCostsForecast({ month }: { month: string }) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['recurring-expenses-forecast', month],
    queryFn: () => getRecurringExpensesForecast(month),
    placeholderData: keepPreviousData,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
    queryClient.invalidateQueries({ queryKey: ['transactions'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const settleMutation = useMutation({
    mutationFn: (item: RecurringExpenseForecastItem) =>
      item.kind === 'payroll' && item.employeeId
        ? settlePayroll(item.employeeId, month, item.dayOfMonth)
        : settleRecurringExpense(item.id, month),
    onSuccess: () => {
      invalidate()
      toast.success('Baixa lançada no caixa!')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  // Desfaz a baixa: remove o lançamento vinculado (volta a "a pagar")
  const unsettleMutation = useMutation({
    mutationFn: (transactionId: string) => deleteTransaction(transactionId),
    onSuccess: () => {
      invalidate()
      toast.success('Baixa desfeita.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const forecast = query.data

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-2">
        <CalendarClock className="h-[18px] w-[18px] text-ink-tertiary" strokeWidth={1.9} />
        <h2 className="font-display text-lg font-bold text-ink">Custos fixos</h2>
        <span className="text-sm capitalize text-ink-tertiary">· {formatMonthLabel(month)}</span>
      </div>

      {query.isPending ? (
        <SkeletonList rows={3} />
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-secondary">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : !forecast || forecast.items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nenhum custo fixo previsto"
          description="Cadastre custos fixos em Configurações → Estabelecimento e a folha dos profissionais em Configurações → Funcionários para prever as saídas e dar baixa por aqui."
        />
      ) : (
        <Card>
          {/* Resumo da previsão do mês */}
          <div className="grid grid-cols-1 border-b border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
            <div className="px-5 py-4">
              <p className="text-[13px] text-ink-secondary">Total do mês</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-ink">
                {formatBRL(forecast.summary.totalCents)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-ink-secondary">Já pago</p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-success-dark">
                {formatBRL(forecast.summary.postedCents)}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] text-ink-secondary">
                A pagar{' '}
                {forecast.summary.pendingCount > 0 && `(${forecast.summary.pendingCount})`}
              </p>
              <p className="mt-1 font-display text-xl font-bold tabular-nums text-error-dark">
                {formatBRL(forecast.summary.pendingCents)}
              </p>
            </div>
          </div>

          <Table>
            <THead>
              <tr>
                <Th>Descrição</Th>
                <Th className="w-32">Vencimento</Th>
                <Th className="text-right">Valor</Th>
                <Th className="w-48 text-right">Status</Th>
              </tr>
            </THead>
            <TBody>
              {forecast.items.map((item) => {
                const commissionCents = item.commissionCents ?? 0
                return (
                  <Tr key={item.id}>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{item.description}</span>
                        {item.kind === 'payroll' && <Badge tone="info">Folha</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-secondary">
                      {formatDate(item.dueDate)}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      <div className="font-medium tabular-nums text-ink">
                        {formatBRL(item.amountCents)}
                      </div>
                      {item.kind === 'payroll' && commissionCents > 0 && (
                        <div className="text-xs text-ink-tertiary">
                          + {formatBRL(commissionCents)} em comissão
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      {item.posted ? (
                        <div className="inline-flex items-center justify-end gap-2">
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success-dark">
                            <Check className="h-4 w-4" />
                            Baixado
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-ink-tertiary"
                            onClick={() =>
                              item.transactionId && unsettleMutation.mutate(item.transactionId)
                            }
                            isLoading={
                              unsettleMutation.isPending &&
                              unsettleMutation.variables === item.transactionId
                            }
                          >
                            Desfazer
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => settleMutation.mutate(item)}
                          isLoading={
                            settleMutation.isPending && settleMutation.variables?.id === item.id
                          }
                        >
                          Dar baixa
                        </Button>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </section>
  )
}

export function FinancePage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const today = todayStr()
  const presets = useMemo(
    () => [
      { label: 'Este mês', from: `${today.slice(0, 7)}-01`, to: today },
      { label: 'Últimos 30 dias', from: addDays(today, -30), to: today },
      { label: 'Hoje', from: today, to: today },
    ],
    [today],
  )

  const [from, setFrom] = useState(presets[0].from)
  const [to, setTo] = useState(presets[0].to)
  const [typeFilter, setTypeFilter] = useState<TransactionType | ''>('')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NewTransactionForm>(emptyForm)
  const [formErrors, setFormErrors] = useState<{ description?: string; amount?: string; date?: string }>({})
  const [toDelete, setToDelete] = useState<Transaction | null>(null)

  const query = useQuery({
    queryKey: ['transactions', from, to, typeFilter],
    queryFn: () => listTransactions({ from, to, type: typeFilter || undefined }),
    placeholderData: keepPreviousData,
  })

  const createMutation = useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lançamento criado!')
      setDialogOpen(false)
      setForm(emptyForm())
      setFormErrors({})
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      // Excluir a saída de um custo fixo baixado o devolve para "a pagar".
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Lançamento excluído.')
      setToDelete(null)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  function openNewDialog() {
    setForm(emptyForm())
    setFormErrors({})
    setDialogOpen(true)
  }

  function handleCreate() {
    const errors: typeof formErrors = {}
    if (!form.description.trim()) errors.description = 'Informe uma descrição'
    const amountCents = parseBRLToCents(form.amount)
    if (amountCents <= 0) errors.amount = 'Informe um valor maior que zero'
    if (!form.date) errors.date = 'Informe a data'
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    createMutation.mutate({
      description: form.description.trim(),
      amountCents,
      type: form.type,
      date: form.date,
    })
  }

  const summary = query.data?.summary
  const transactions = query.data?.transactions ?? []
  const balanceNegative = (summary?.balanceCents ?? 0) < 0

  return (
    <div>
      <PageHeader
        title="Financeiro"
        description="Fluxo de caixa do seu negócio"
        actions={
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openNewDialog}>
            Novo lançamento
          </Button>
        }
      />

      {/* Toolbar de filtros */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((preset) => {
            const active = from === preset.from && to === preset.to
            return (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={active ? 'secondary' : 'ghost'}
                onClick={() => {
                  setFrom(preset.from)
                  setTo(preset.to)
                }}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="w-40">
            <Input
              type="date"
              aria-label="Data inicial"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <span className="text-sm text-ink-tertiary">até</span>
          <div className="w-40">
            <Input
              type="date"
              aria-label="Data final"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>

        <div className="w-40">
          <Select
            aria-label="Tipo de lançamento"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TransactionType | '')}
          >
            <option value="">Todos</option>
            <option value="income">Entradas</option>
            <option value="expense">Saídas</option>
          </Select>
        </div>
      </div>

      {query.isPending ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <SkeletonList rows={6} />
        </div>
      ) : query.isError ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-ink-secondary">{errorMessage(query.error)}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </Card>
      ) : (
        <>
          {/* Resumo do período */}
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Entradas"
              icon={ArrowUpCircle}
              value={formatBRL(summary?.incomeCents ?? 0)}
              valueClassName="text-success-dark"
            />
            <StatCard
              label="Saídas"
              icon={ArrowDownCircle}
              value={formatBRL(summary?.expenseCents ?? 0)}
              valueClassName="text-error-dark"
            />
            <StatCard
              label="Saldo"
              icon={Wallet}
              value={formatBRL(summary?.balanceCents ?? 0)}
              valueClassName={balanceNegative ? 'text-error-dark' : 'text-ink'}
            />
          </div>

          {/* Lista de lançamentos */}
          {transactions.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="Nenhum lançamento no período"
              description="Os atendimentos concluídos entram aqui automaticamente."
              action={
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={openNewDialog}>
                  Novo lançamento
                </Button>
              }
            />
          ) : (
            <Card>
              <Table>
                <THead>
                  <tr>
                    <Th className="w-32">Data</Th>
                    <Th>Descrição</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="w-16">
                      <span className="sr-only">Ações</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {transactions.map((t) => {
                    const isIncome = t.type === 'income'
                    return (
                      <Tr key={t.id}>
                        <Td className="whitespace-nowrap">{formatDate(t.date)}</Td>
                        <Td>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{t.description}</span>
                            {t.appointmentId != null && <Badge tone="brand">Agendamento</Badge>}
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-right">
                          <span
                            className={cn(
                              'font-semibold tabular-nums',
                              isIncome ? 'text-success-dark' : 'text-error-dark',
                            )}
                          >
                            {isIncome ? '+ ' : '− '}
                            {formatBRL(t.amountCents)}
                          </span>
                        </Td>
                        <Td className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="px-2 text-ink-tertiary"
                            aria-label="Excluir lançamento"
                            onClick={() => setToDelete(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Previsão de custos fixos do mês */}
      <FixedCostsForecast month={from.slice(0, 7)} />

      {/* Comissões apuradas no período */}
      <CommissionsSection from={from} to={to} />

      {/* Dialog: novo lançamento */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          if (!createMutation.isPending) setDialogOpen(false)
        }}
        title="Novo lançamento"
        maxWidth="max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleCreate()
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              aria-pressed={form.type === 'income'}
              onClick={() => setForm((f) => ({ ...f, type: 'income' }))}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40',
                form.type === 'income'
                  ? 'border-success bg-success-light text-success-dark'
                  : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover',
              )}
            >
              <ArrowUpCircle
                className={cn(
                  'h-5 w-5',
                  form.type === 'income' ? 'text-success-dark' : 'text-ink-tertiary',
                )}
                strokeWidth={1.9}
              />
              Entrada
            </button>
            <button
              type="button"
              aria-pressed={form.type === 'expense'}
              onClick={() => setForm((f) => ({ ...f, type: 'expense' }))}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border px-4 py-4 text-sm font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40',
                form.type === 'expense'
                  ? 'border-error bg-error-light text-error-dark'
                  : 'border-line bg-surface text-ink-secondary hover:bg-surface-hover',
              )}
            >
              <ArrowDownCircle
                className={cn(
                  'h-5 w-5',
                  form.type === 'expense' ? 'text-error-dark' : 'text-ink-tertiary',
                )}
                strokeWidth={1.9}
              />
              Saída
            </button>
          </div>

          <Input
            label="Descrição"
            placeholder={form.type === 'income' ? 'Ex.: Venda de produto' : 'Ex.: Compra de material'}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            error={formErrors.description}
            maxLength={120}
          />

          <Input
            label="Valor"
            placeholder="45,90"
            inputMode="decimal"
            leftIcon={<span className="text-sm font-medium">R$</span>}
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            error={formErrors.amount}
          />

          <Input
            label="Data"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            error={formErrors.date}
          />

          <DialogActions className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={createMutation.isPending}>
              Salvar lançamento
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Confirmação de exclusão */}
      <ConfirmDialog
        open={toDelete !== null}
        onClose={() => {
          if (!deleteMutation.isPending) setToDelete(null)
        }}
        onConfirm={() => {
          if (toDelete) deleteMutation.mutate(toDelete.id)
        }}
        title="Excluir lançamento?"
        description={
          toDelete
            ? `"${toDelete.description}" (${formatBRL(toDelete.amountCents)}) será removido do fluxo de caixa.`
            : undefined
        }
        confirmLabel="Excluir"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
