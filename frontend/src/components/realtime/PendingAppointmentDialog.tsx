import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock, Phone, Scissors, User } from 'lucide-react'
import { updateAppointment } from '../../api/appointments'
import type { Appointment } from '../../types/api'
import { formatDate, formatPhone } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { useToast } from '../ui/Toast'

/** Dados mínimos para o popup: vindos do SSE (achatado) ou da lista. */
export interface PendingAppointmentView {
  id: string
  date: string
  startTime: string
  endTime: string
  clientName: string
  clientPhone: string
  serviceName: string
  employeeName: string
}

/** Normaliza um agendamento da API (nested) para a view do popup. */
export function toPendingView(appointment: Appointment): PendingAppointmentView {
  return {
    id: appointment.id,
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    clientName: appointment.client.name,
    clientPhone: appointment.client.phone,
    serviceName: appointment.service.name,
    employeeName: appointment.employee.name,
  }
}

/**
 * Popup de aprovação de um agendamento pendente do link público. Confirma ou
 * recusa via PATCH e avisa `onResolved` ao concluir. Usado tanto pelo aviso em
 * tempo real (SSE) quanto ao clicar numa notificação do sino.
 */
export function PendingAppointmentDialog({
  appointment,
  extraCount = 0,
  onClose,
  onResolved,
}: {
  appointment: PendingAppointmentView
  extraCount?: number
  onClose: () => void
  onResolved: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (status: 'confirmed' | 'cancelled') => updateAppointment(appointment.id, { status }),
    onSuccess: (_res, status) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(status === 'confirmed' ? 'Agendamento confirmado' : 'Agendamento recusado')
      onResolved()
    },
    onError: () => {
      toast.error('Não foi possível atualizar. Veja na agenda.')
      onResolved()
    },
  })

  return (
    <Dialog
      open
      onClose={onClose}
      title="Agendamento pendente"
      description="Confirme ou recuse este agendamento feito pelo link público."
      maxWidth="max-w-md"
    >
      <div className="space-y-3 rounded-xl bg-background p-4 text-sm">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <div>
            <p className="font-medium text-ink">{appointment.clientName}</p>
            <p className="flex items-center gap-1 text-xs text-ink-tertiary">
              <Phone className="h-3 w-3" /> {formatPhone(appointment.clientPhone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Scissors className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">{appointment.serviceName}</p>
        </div>
        <div className="flex items-center gap-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">
            {formatDate(appointment.date)} · {appointment.startTime} – {appointment.endTime}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">Profissional: {appointment.employeeName}</p>
        </div>
      </div>

      {extraCount > 0 && (
        <p className="mt-3 text-center text-xs text-ink-tertiary">
          +{extraCount} aguardando confirmação
        </p>
      )}

      <DialogActions>
        <Button
          variant="danger"
          onClick={() => mutation.mutate('cancelled')}
          isLoading={mutation.isPending}
        >
          Recusar
        </Button>
        <Button onClick={() => mutation.mutate('confirmed')} isLoading={mutation.isPending}>
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
