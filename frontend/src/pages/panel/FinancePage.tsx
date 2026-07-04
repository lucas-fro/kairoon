import { useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDownCircle, ArrowUpCircle, Plus, Trash2, Wallet } from 'lucide-react'
import { ApiError } from '../../api/client'
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
import { cn, formatBRL, formatDate, parseBRLToCents } from '../../lib/format'
import type { LucideIcon } from 'lucide-react'
import type { Transaction, TransactionType } from '../../types/api'

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
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNewDialog}>
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
          <Button variant="outline" className="mt-4" onClick={() => query.refetch()}>
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
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openNewDialog}>
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
