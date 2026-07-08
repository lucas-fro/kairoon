import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock } from 'lucide-react'
import { listAppointments } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { promoteWaitlistEntry } from '../../api/waitlist'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { SelectMenu } from '../ui/SelectMenu'
import { useToast } from '../ui/Toast'
import { timeToMinutes } from '../../lib/dates'
import { formatDate, formatPhone } from '../../lib/format'
import type { Employee, WaitlistEntry } from '../../types/api'
import { buildTimeOptions } from './timeOptions'

interface WaitlistPromoteDialogProps {
  entry: WaitlistEntry
  onClose: () => void
  employees: Employee[]
  startMinutes: number
  endMinutes: number
}

export function WaitlistPromoteDialog({
  entry,
  onClose,
  employees,
  startMinutes,
  endMinutes,
}: WaitlistPromoteDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeEmployees = employees.filter((e) => e.active)
  const timeOptions = useMemo(
    () => buildTimeOptions(startMinutes, endMinutes),
    [startMinutes, endMinutes],
  )

  const [employeeId, setEmployeeId] = useState(
    entry.preferredEmployee?.id ?? activeEmployees[0]?.id ?? '',
  )
  const [startTime, setStartTime] = useState('')

  useEffect(() => {
    setEmployeeId(entry.preferredEmployee?.id ?? activeEmployees[0]?.id ?? '')
    setStartTime('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id])

  const dayAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'slots', entry.targetDate, employeeId],
    queryFn: () => listAppointments({ start: entry.targetDate, end: entry.targetDate, employeeId }),
    enabled: Boolean(employeeId),
  })

  const occupiedTimes = useMemo(() => {
    const set = new Set<string>()
    const duration = entry.service.durationMinutes
    const busy = (dayAppointmentsQuery.data ?? [])
      .filter((a) => a.status !== 'cancelled')
      .map((a) => ({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) }))
    for (const time of timeOptions) {
      const start = timeToMinutes(time)
      const end = start + duration
      if (busy.some((b) => start < b.end && end > b.start)) set.add(time)
    }
    return set
  }, [dayAppointmentsQuery.data, entry.service.durationMinutes, timeOptions])

  const allOccupied = timeOptions.length > 0 && timeOptions.every((t) => occupiedTimes.has(t))

  const promoteMutation = useMutation({
    mutationFn: () => promoteWaitlistEntry(entry.id, { startTime, employeeId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Encaixado na agenda!')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao encaixar')
    },
  })

  const formValid = Boolean(employeeId && startTime) && !occupiedTimes.has(startTime)

  return (
    <Dialog open onClose={onClose} title="Encaixar na agenda" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-lg border border-line bg-background px-3 py-2.5">
          <p className="text-sm font-medium text-ink">{entry.client.name}</p>
          <p className="text-xs text-ink-tertiary">
            {formatPhone(entry.client.phone)} · {entry.service.name} · {formatDate(entry.targetDate)}
          </p>
          {entry.note && <p className="mt-1 text-xs text-ink-secondary">Obs.: {entry.note}</p>}
        </div>

        {activeEmployees.length > 1 && (
          <SelectMenu
            label="Profissional"
            value={employeeId}
            onChange={setEmployeeId}
            options={activeEmployees.map((employee) => ({
              value: employee.id,
              label: employee.name,
            }))}
          />
        )}

        <div>
          <SelectMenu
            label="Horário"
            value={startTime}
            onChange={setStartTime}
            placeholder="Selecione o horário"
            options={timeOptions.map((time) => ({
              value: time,
              label: occupiedTimes.has(time) ? `${time} · ocupado` : time,
              disabled: occupiedTimes.has(time),
            }))}
          />
          {dayAppointmentsQuery.isFetching ? (
            <p className="mt-2 text-xs text-ink-tertiary">Verificando horários ocupados…</p>
          ) : allOccupied ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-dark">
              <CalendarClock className="h-3.5 w-3.5" />
              Sem horários livres neste dia. Tente outro profissional ou remova da fila.
            </p>
          ) : null}
        </div>

        <DialogActions className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={promoteMutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => promoteMutation.mutate()}
            disabled={!formValid}
            isLoading={promoteMutation.isPending}
          >
            Encaixar
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
