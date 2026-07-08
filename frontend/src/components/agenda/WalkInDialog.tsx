import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, UserPlus, Zap } from 'lucide-react'
import { createAppointment, listAppointments } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { createWaitlistEntry } from '../../api/waitlist'
import { ClientPicker, type SelectedClient } from '../clients/ClientPicker'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import { useToast } from '../ui/Toast'
import { minutesToTime, timeToMinutes, todayStr } from '../../lib/dates'
import { formatBRL, formatDateLong, formatDuration } from '../../lib/format'
import type { Employee, Service } from '../../types/api'

interface WalkInDialogProps {
  open: boolean
  onClose: () => void
  services: Service[]
  employees: Employee[]
  defaultEmployeeId?: string
}

function nowHHmm(): string {
  const now = new Date()
  return minutesToTime(now.getHours() * 60 + now.getMinutes())
}

export function WalkInDialog({
  open,
  onClose,
  services,
  employees,
  defaultEmployeeId,
}: WalkInDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeServices = services.filter((s) => s.active)
  const activeEmployees = employees.filter((e) => e.active)
  const today = todayStr()

  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)
  const [serviceId, setServiceId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [startTime, setStartTime] = useState(nowHHmm())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setSelectedClient(null)
    setServiceId(activeServices[0]?.id ?? '')
    setEmployeeId(defaultEmployeeId ?? activeEmployees[0]?.id ?? '')
    setStartTime(nowHHmm())
    setNote('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEmployeeId])

  // Preenche os selects quando as queries resolverem com o dialog já aberto
  useEffect(() => {
    if (!open) return
    if (!serviceId && activeServices[0]) setServiceId(activeServices[0].id)
    if (!employeeId && activeEmployees[0]) setEmployeeId(defaultEmployeeId ?? activeEmployees[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, services, employees])

  const dayAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'slots', today, employeeId],
    queryFn: () => listAppointments({ start: today, end: today, employeeId }),
    enabled: open && Boolean(employeeId),
  })

  const service = activeServices.find((s) => s.id === serviceId)

  // Há vaga agora? (mesma lógica de sobreposição do NewAppointmentDialog)
  const hasVacancyNow = useMemo(() => {
    const duration = service?.durationMinutes ?? 0
    if (!duration || !startTime) return false
    const start = timeToMinutes(startTime)
    const end = start + duration
    const busy = (dayAppointmentsQuery.data ?? [])
      .filter((a) => a.status !== 'cancelled')
      .map((a) => ({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) }))
    return !busy.some((b) => start < b.end && end > b.start)
  }, [service, startTime, dayAppointmentsQuery.data])

  const createMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Atendimento registrado!')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao registrar')
    },
  })

  const waitlistMutation = useMutation({
    mutationFn: createWaitlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      toast.success('Cliente adicionado à fila de espera')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao adicionar à fila')
    },
  })

  const isBusy = createMutation.isPending || waitlistMutation.isPending
  const baseReady = Boolean(selectedClient && serviceId && employeeId)

  function handleAttend() {
    if (!baseReady || !selectedClient || !startTime) return
    createMutation.mutate({ serviceId, employeeId, date: today, startTime, clientId: selectedClient.id })
  }

  function handleWaitlist() {
    if (!baseReady || !selectedClient) return
    waitlistMutation.mutate({
      clientId: selectedClient.id,
      serviceId,
      preferredEmployeeId: employeeId,
      targetDate: today,
      note: note.trim() || undefined,
    })
  }

  const checking = dayAppointmentsQuery.isPending || dayAppointmentsQuery.isFetching

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Atender agora"
      description={`Cliente chegou sem agendamento · ${formatDateLong(today)}`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Cliente */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-secondary">Cliente</p>
          <ClientPicker value={selectedClient} onChange={setSelectedClient} disabled={isBusy} />
        </div>

        <SelectMenu
          label="Serviço"
          value={serviceId}
          onChange={setServiceId}
          options={[
            { value: '', label: 'Selecione o serviço' },
            ...activeServices.map((s) => ({
              value: s.id,
              label: `${s.name} · ${formatDuration(s.durationMinutes)} · ${formatBRL(s.priceCents)}`,
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

        <Input
          label="Horário"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          hint="Começa agora por padrão. Ajuste se precisar."
        />

        {/* Estado da vaga + ação */}
        {baseReady && checking ? (
          <p className="text-xs text-ink-tertiary">Verificando disponibilidade…</p>
        ) : baseReady && !hasVacancyNow ? (
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning-light/50 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-warning-dark">
              <Clock className="h-4 w-4 shrink-0" />
              Sem vaga neste horário para o profissional.
            </p>
            <Input
              label="Observação (opcional)"
              placeholder="Ex.: após 15h, qualquer profissional…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : null}

        <DialogActions className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={isBusy}>
            Cancelar
          </Button>
          {baseReady && !checking && !hasVacancyNow ? (
            <Button
              onClick={handleWaitlist}
              disabled={!baseReady}
              isLoading={waitlistMutation.isPending}
              leftIcon={<UserPlus className="h-4 w-4" />}
            >
              Adicionar à fila de espera
            </Button>
          ) : (
            <Button
              onClick={handleAttend}
              disabled={!baseReady || checking || !hasVacancyNow}
              isLoading={createMutation.isPending}
              leftIcon={<Zap className="h-4 w-4" />}
            >
              Atender agora
            </Button>
          )}
        </DialogActions>
      </div>
    </Dialog>
  )
}
