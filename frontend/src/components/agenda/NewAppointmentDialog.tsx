import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { createAppointment, listAppointments } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { ClientPicker, type SelectedClient } from '../clients/ClientPicker'
import { useToast } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import { timeToMinutes, todayStr } from '../../lib/dates'
import { formatBRL, formatDuration } from '../../lib/format'
import type { Employee, Service } from '../../types/api'
import { buildTimeOptions } from './timeOptions'

interface NewAppointmentDialogProps {
  open: boolean
  onClose: () => void
  services: Service[]
  employees: Employee[]
  startMinutes: number
  endMinutes: number
  defaultDate?: string
  defaultTime?: string
  defaultEmployeeId?: string
}

export function NewAppointmentDialog({
  open,
  onClose,
  services,
  employees,
  startMinutes,
  endMinutes,
  defaultDate,
  defaultTime,
  defaultEmployeeId,
}: NewAppointmentDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeServices = services.filter((s) => s.active)
  const activeEmployees = employees.filter((e) => e.active)
  const timeOptions = useMemo(
    () => buildTimeOptions(startMinutes, endMinutes),
    [startMinutes, endMinutes],
  )

  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)

  const [serviceId, setServiceId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(defaultDate ?? todayStr())
  const [startTime, setStartTime] = useState(defaultTime ?? timeOptions[0] ?? '09:00')

  useEffect(() => {
    if (!open) return
    setDate(defaultDate ?? todayStr())
    setStartTime(defaultTime ?? timeOptions[0] ?? '09:00')
    setServiceId(activeServices[0]?.id ?? '')
    // Pré-seleciona o profissional da agenda filtrada, se houver
    setEmployeeId(defaultEmployeeId ?? activeEmployees[0]?.id ?? '')
    setSelectedClient(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultTime, defaultEmployeeId])

  // Preenche os selects quando as queries resolverem com o dialog já aberto
  useEffect(() => {
    if (!open) return
    if (!serviceId && activeServices[0]) setServiceId(activeServices[0].id)
    if (!employeeId && activeEmployees[0]) setEmployeeId(defaultEmployeeId ?? activeEmployees[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, services, employees])

  // Agendamentos do profissional no dia, para marcar horários ocupados
  const dayAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'slots', date, employeeId],
    queryFn: () => listAppointments({ start: date, end: date, employeeId }),
    enabled: open && Boolean(date && employeeId),
  })

  const occupiedTimes = useMemo(() => {
    const set = new Set<string>()
    const duration = services.find((s) => s.id === serviceId)?.durationMinutes ?? 0
    if (!duration) return set
    const busy = (dayAppointmentsQuery.data ?? [])
      .filter((a) => a.status !== 'cancelled')
      .map((a) => ({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) }))
    for (const time of timeOptions) {
      const start = timeToMinutes(time)
      const end = start + duration
      if (busy.some((b) => start < b.end && end > b.start)) set.add(time)
    }
    return set
  }, [dayAppointmentsQuery.data, services, serviceId, timeOptions])

  const createMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Agendamento criado com sucesso')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao criar agendamento')
    },
  })

  const formValid =
    Boolean(serviceId && employeeId && date && startTime && selectedClient) &&
    !occupiedTimes.has(startTime)

  function handleSubmit() {
    if (!formValid || !selectedClient) return
    createMutation.mutate({ serviceId, employeeId, date, startTime, clientId: selectedClient.id })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo agendamento" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Cliente */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-secondary">Cliente</p>
          <ClientPicker
            value={selectedClient}
            onChange={setSelectedClient}
            disabled={createMutation.isPending}
          />
        </div>

        <SelectMenu
          label="Serviço"
          value={serviceId}
          onChange={setServiceId}
          options={[
            { value: '', label: 'Selecione o serviço' },
            ...activeServices.map((service) => ({
              value: service.id,
              label: `${service.name} · ${formatDuration(service.durationMinutes)} · ${formatBRL(service.priceCents)}`,
            })),
          ]}
        />

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

        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

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
          {dayAppointmentsQuery.isFetching && (
            <p className="mt-2 text-xs text-ink-tertiary">Verificando horários ocupados…</p>
          )}
        </div>

        <DialogActions className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!formValid} isLoading={createMutation.isPending}>
            Criar agendamento
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
