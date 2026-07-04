import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Save } from 'lucide-react'
import { ApiError } from '../../api/client'
import { getWorkingHours, updateWorkingHours } from '../../api/establishment'
import { WEEKDAY_LABELS, timeToMinutes } from '../../lib/dates'
import type { WorkingHour } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { SkeletonList } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

/** Garante as 7 linhas dom→sáb e horários no formato HH:mm */
function normalizeWeek(data: WorkingHour[]): WorkingHour[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const found = data.find((item) => item.dayOfWeek === dayOfWeek)
    if (!found) {
      return { dayOfWeek, opensAt: '09:00', closesAt: '18:00', isClosed: true }
    }
    return {
      ...found,
      opensAt: found.opensAt.slice(0, 5),
      closesAt: found.closesAt.slice(0, 5),
    }
  })
}

function getRowError(row: WorkingHour): string | undefined {
  if (row.isClosed) return undefined
  if (!row.opensAt || !row.closesAt) return 'Preencha os dois horários'
  if (timeToMinutes(row.opensAt) >= timeToMinutes(row.closesAt)) {
    return 'O horário de abertura deve ser antes do fechamento'
  }
  return undefined
}

export function WorkingHoursTab() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['working-hours'], queryFn: getWorkingHours })
  const [rows, setRows] = useState<WorkingHour[] | null>(null)

  useEffect(() => {
    if (query.data) setRows(normalizeWeek(query.data))
  }, [query.data])

  const mutation = useMutation({
    mutationFn: updateWorkingHours,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['working-hours'] })
      toast.success('Horário de funcionamento atualizado!')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
    },
  })

  function updateRow(dayOfWeek: number, patch: Partial<WorkingHour>) {
    setRows((current) =>
      current
        ? current.map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row))
        : current,
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!rows) return
    if (rows.some((row) => getRowError(row))) return
    mutation.mutate(rows)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horário de funcionamento</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isPending && <SkeletonList rows={7} />}

        {query.isError && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar os horários.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        )}

        {!query.isPending && !query.isError && rows && (
          <form onSubmit={handleSubmit} noValidate>
            <div className="divide-y divide-line-divider">
              {rows.map((row) => {
                const error = getRowError(row)
                return (
                  <div key={row.dayOfWeek} className="py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center justify-between gap-3 sm:w-56 sm:justify-start">
                        <span className="w-20 text-sm font-medium text-ink">
                          {WEEKDAY_LABELS[row.dayOfWeek]}
                        </span>
                        <label className="flex cursor-pointer select-none items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!row.isClosed}
                            onChange={(e) =>
                              updateRow(row.dayOfWeek, { isClosed: !e.target.checked })
                            }
                            className="h-4 w-4 cursor-pointer rounded border-line accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
                            aria-label={`Aberto em ${WEEKDAY_LABELS[row.dayOfWeek]}`}
                          />
                          <span className="w-16 text-sm text-ink-secondary">
                            {row.isClosed ? 'Fechado' : 'Aberto'}
                          </span>
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-28">
                          <Input
                            type="time"
                            value={row.opensAt}
                            disabled={row.isClosed}
                            onChange={(e) => updateRow(row.dayOfWeek, { opensAt: e.target.value })}
                            aria-label={`Abertura em ${WEEKDAY_LABELS[row.dayOfWeek]}`}
                          />
                        </div>
                        <span className="text-sm text-ink-tertiary">às</span>
                        <div className="w-28">
                          <Input
                            type="time"
                            value={row.closesAt}
                            disabled={row.isClosed}
                            onChange={(e) => updateRow(row.dayOfWeek, { closesAt: e.target.value })}
                            aria-label={`Fechamento em ${WEEKDAY_LABELS[row.dayOfWeek]}`}
                          />
                        </div>
                      </div>
                    </div>
                    {error && <p className="mt-1.5 text-xs text-error-dark">{error}</p>}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="submit"
                isLoading={mutation.isPending}
                disabled={rows.some((row) => Boolean(getRowError(row)))}
                leftIcon={<Save className="h-4 w-4" />}
              >
                Salvar
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
