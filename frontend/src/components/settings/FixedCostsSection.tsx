import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Pencil, Plus, Power, Receipt, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  createRecurringExpense,
  deleteRecurringExpense,
  listRecurringExpenses,
  updateRecurringExpense,
} from '../../api/recurringExpenses'
import type { RecurringExpensePayload } from '../../api/recurringExpenses'
import { formatBRL, parseBRLToCents } from '../../lib/format'
import type { RecurringExpense } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SkeletonList } from '../ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../ui/Table'
import { useToast } from '../ui/Toast'

const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

export function FixedCostsSection() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['recurring-expenses'], queryFn: listRecurringExpenses })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringExpense | null>(null)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('5')
  const [formErrors, setFormErrors] = useState<{ description?: string; amount?: string }>({})
  const [deleteTarget, setDeleteTarget] = useState<RecurringExpense | null>(null)

  const expenses = query.data ?? []
  const activeTotalCents = expenses
    .filter((e) => e.active)
    .reduce((sum, e) => sum + e.amountCents, 0)

  function resetForm() {
    setDescription('')
    setAmount('')
    setDayOfMonth('5')
    setFormErrors({})
  }

  function openCreate() {
    setEditing(null)
    resetForm()
    setDialogOpen(true)
  }

  function openEdit(expense: RecurringExpense) {
    setEditing(expense)
    setDescription(expense.description)
    setAmount((expense.amountCents / 100).toFixed(2).replace('.', ','))
    setDayOfMonth(String(expense.dayOfMonth))
    setFormErrors({})
    setDialogOpen(true)
  }

  const createMutation = useMutation({
    mutationFn: createRecurringExpense,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
      toast.success('Custo fixo cadastrado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RecurringExpensePayload> }) =>
      updateRecurringExpense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
      toast.success('Custo fixo atualizado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const toggleMutation = useMutation({
    mutationFn: (expense: RecurringExpense) =>
      updateRecurringExpense(expense.id, { active: !expense.active }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
      toast.success(updated.active ? 'Custo fixo ativado!' : 'Custo fixo desativado.')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses-forecast'] })
      toast.success('Custo fixo excluído.')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(errorMessage(err))
      setDeleteTarget(null)
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: typeof formErrors = {}
    if (!description.trim()) errors.description = 'Informe uma descrição'
    const amountCents = parseBRLToCents(amount)
    if (amountCents <= 0) errors.amount = 'Informe um valor maior que zero'
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    const payload: RecurringExpensePayload = {
      description: description.trim(),
      amountCents,
      dayOfMonth: Number(dayOfMonth),
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: payload })
    else createMutation.mutate(payload)
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custos fixos</CardTitle>
        <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
          Novo custo fixo
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-ink-secondary">
          Cadastre aluguel, energia, salários e outras despesas recorrentes. Elas alimentam a
          previsão do mês no Financeiro, onde você dá baixa e lança no fluxo de caixa.
        </p>

        {query.isPending && <SkeletonList rows={3} />}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-line px-6 py-8 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar os custos fixos.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!query.isPending && !query.isError && expenses.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line px-6 py-8 text-center">
            <Receipt className="h-6 w-6 text-ink-tertiary" strokeWidth={1.7} />
            <p className="text-sm text-ink-secondary">
              Nenhum custo fixo cadastrado. Comece pelo aluguel, energia ou salários.
            </p>
          </div>
        )}

        {!query.isPending && !query.isError && expenses.length > 0 && (
          <>
            <div className="overflow-hidden rounded-lg border border-line">
              <Table>
                <THead>
                  <Tr>
                    <Th>Descrição</Th>
                    <Th className="w-32">Vencimento</Th>
                    <Th className="text-right">Valor</Th>
                    <Th className="w-24">Status</Th>
                    <Th className="text-right">Ações</Th>
                  </Tr>
                </THead>
                <TBody>
                  {expenses.map((expense) => (
                    <Tr key={expense.id}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{expense.description}</span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-secondary">
                        Todo dia {expense.dayOfMonth}
                      </Td>
                      <Td className="whitespace-nowrap text-right font-medium tabular-nums text-ink">
                        {formatBRL(expense.amountCents)}
                      </Td>
                      <Td>
                        {expense.active ? (
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
                            onClick={() => openEdit(expense)}
                            leftIcon={<Pencil className="h-3.5 w-3.5" />}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleMutation.mutate(expense)}
                            isLoading={
                              toggleMutation.isPending && toggleMutation.variables?.id === expense.id
                            }
                            leftIcon={<Power className="h-3.5 w-3.5" />}
                          >
                            <span className="w-[4.5rem] text-left">
                              {expense.active ? 'Desativar' : 'Ativar'}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(expense)}
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
            </div>
            <p className="text-right text-sm text-ink-secondary">
              Total mensal (ativos):{' '}
              <span className="font-semibold tabular-nums text-ink">{formatBRL(activeTotalCents)}</span>
            </p>
          </>
        )}
      </CardContent>

      <Dialog
        open={dialogOpen}
        onClose={() => {
          if (!isSaving) setDialogOpen(false)
        }}
        title={editing ? 'Editar custo fixo' : 'Novo custo fixo'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Descrição"
            placeholder="Ex.: Aluguel do espaço"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={formErrors.description}
            maxLength={120}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Valor mensal"
              inputMode="decimal"
              placeholder="1.800,00"
              leftIcon={<span className="text-sm font-medium">R$</span>}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              error={formErrors.amount}
            />
            <Select
              label="Dia do vencimento"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(e.target.value)}
            >
              {DAY_OPTIONS.map((day) => (
                <option key={day} value={day}>
                  Dia {day}
                </option>
              ))}
            </Select>
          </div>

          <DialogActions className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={isSaving}>
              {editing ? 'Salvar' : 'Cadastrar'}
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
        title="Excluir custo fixo?"
        description={
          deleteTarget
            ? `"${deleteTarget.description}" deixará de aparecer na previsão. As baixas já lançadas no caixa são mantidas.`
            : undefined
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        isLoading={deleteMutation.isPending}
      />
    </Card>
  )
}
