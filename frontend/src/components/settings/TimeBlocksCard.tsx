import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createTimeBlock, deleteTimeBlock, listTimeBlocks } from '../../api/establishment'
import { formatDate } from '../../lib/format'
import { todayStr } from '../../lib/dates'
import type { TimeBlock } from '../../types/api'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { SkeletonList } from '../ui/Skeleton'
import { useToast } from '../ui/Toast'

function describeBlock(block: TimeBlock): string {
  if (!block.startTime || !block.endTime) return 'Dia inteiro'
  return `${block.startTime} – ${block.endTime}`
}

export function TimeBlocksCard() {
  const queryClient = useQueryClient()
  const toast = useToast()

  const [date, setDate] = useState('')
  const [fullDay, setFullDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | undefined>()

  const query = useQuery({ queryKey: ['time-blocks'], queryFn: listTimeBlocks })

  const createMutation = useMutation({
    mutationFn: createTimeBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-blocks'] })
      toast.success('Bloqueio adicionado')
      setDate('')
      setFullDay(true)
      setStartTime('')
      setEndTime('')
      setReason('')
      setError(undefined)
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteTimeBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-blocks'] })
      toast.success('Bloqueio removido')
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Erro ao remover bloqueio'),
  })

  function handleAdd() {
    if (!date) {
      setError('Escolha a data')
      return
    }
    if (!fullDay) {
      if (!startTime || !endTime) {
        setError('Informe o horário de início e fim')
        return
      }
      if (startTime >= endTime) {
        setError('O horário de início deve ser anterior ao fim')
        return
      }
    }
    setError(undefined)
    createMutation.mutate({
      date,
      startTime: fullDay ? undefined : startTime,
      endTime: fullDay ? undefined : endTime,
      reason: reason.trim() || undefined,
    })
  }

  const blocks = query.data ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bloqueios de agenda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-ink-secondary">
          Datas ou horários em que não haverá atendimento — feriados, folgas ou compromissos. Esses
          períodos ficam indisponíveis no link público de agendamento.
        </p>

        {/* Formulário de novo bloqueio */}
        <div className="space-y-3 rounded-lg bg-background p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Data"
              type="date"
              min={todayStr()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Input
              label="Motivo (opcional)"
              placeholder="Ex.: Feriado, folga…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line accent-primary"
              checked={fullDay}
              onChange={(e) => setFullDay(e.target.checked)}
            />
            Dia inteiro
          </label>

          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Início"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                label="Fim"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          )}

          {error && <p className="text-xs text-error-dark">{error}</p>}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={handleAdd}
              isLoading={createMutation.isPending}
            >
              Adicionar bloqueio
            </Button>
          </div>
        </div>

        {/* Lista de bloqueios */}
        {query.isPending ? (
          <SkeletonList rows={2} />
        ) : blocks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <CalendarOff className="h-6 w-6 text-ink-tertiary" />
            <p className="text-sm text-ink-tertiary">Nenhum bloqueio cadastrado.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line-divider">
            {blocks.map((block) => (
              <li key={block.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {formatDate(block.date)}{' '}
                    <span className="font-normal text-ink-secondary">· {describeBlock(block)}</span>
                  </p>
                  {block.reason && <p className="text-xs text-ink-tertiary">{block.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-2 text-error-dark hover:bg-error-light hover:text-error-dark"
                  onClick={() => deleteMutation.mutate(block.id)}
                  aria-label="Remover bloqueio"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
