import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Clock, Phone, Scissors, User } from 'lucide-react'
import { updateAppointment } from '../../api/appointments'
import { API_URL, getToken } from '../../api/client'
import { formatDate, formatPhone } from '../../lib/format'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { useToast } from '../ui/Toast'

interface PendingEvent {
  id: string
  date: string
  startTime: string
  endTime: string
  clientName: string
  clientPhone: string
  serviceName: string
  employeeName: string
}

/**
 * Escuta o stream em tempo real (SSE) e exibe um popup pedindo para confirmar
 * (ou recusar) cada agendamento pendente feito pelo link público.
 */
export function PendingBookingsListener() {
  const [queue, setQueue] = useState<PendingEvent[]>([])
  const queryClient = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const source = new EventSource(`${API_URL}/realtime/stream?token=${encodeURIComponent(token)}`)
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'pending-appointment' && data.appointment) {
          const appointment = data.appointment as PendingEvent
          setQueue((q) => (q.some((p) => p.id === appointment.id) ? q : [...q, appointment]))
          queryClient.invalidateQueries({ queryKey: ['appointments'] })
        }
      } catch {
        /* ignora mensagens malformadas */
      }
    }
    return () => source.close()
  }, [queryClient])

  const current = queue[0] ?? null

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed' | 'cancelled' }) =>
      updateAppointment(id, { status }),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(
        variables.status === 'confirmed' ? 'Agendamento confirmado' : 'Agendamento recusado',
      )
      setQueue((q) => q.slice(1))
    },
    onError: () => {
      toast.error('Não foi possível atualizar. Veja na agenda.')
      setQueue((q) => q.slice(1))
    },
  })

  if (!current) return null

  return (
    <Dialog
      open
      onClose={() => setQueue((q) => q.slice(1))}
      title="Novo agendamento pendente"
      description="Um cliente acabou de agendar pelo link público."
      maxWidth="max-w-md"
    >
      <div className="space-y-3 rounded-xl bg-background p-4 text-sm">
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <div>
            <p className="font-medium text-ink">{current.clientName}</p>
            <p className="flex items-center gap-1 text-xs text-ink-tertiary">
              <Phone className="h-3 w-3" /> {formatPhone(current.clientPhone)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Scissors className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">{current.serviceName}</p>
        </div>
        <div className="flex items-center gap-3">
          <CalendarClock className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">
            {formatDate(current.date)} · {current.startTime} – {current.endTime}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <p className="text-ink-secondary">Profissional: {current.employeeName}</p>
        </div>
      </div>

      {queue.length > 1 && (
        <p className="mt-3 text-center text-xs text-ink-tertiary">
          +{queue.length - 1} aguardando confirmação
        </p>
      )}

      <DialogActions>
        <Button
          variant="danger"
          onClick={() => mutation.mutate({ id: current.id, status: 'cancelled' })}
          isLoading={mutation.isPending}
        >
          Recusar
        </Button>
        <Button
          onClick={() => mutation.mutate({ id: current.id, status: 'confirmed' })}
          isLoading={mutation.isPending}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
