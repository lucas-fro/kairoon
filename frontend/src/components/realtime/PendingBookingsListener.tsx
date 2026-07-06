import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { API_URL, getToken } from '../../api/client'
import { PendingAppointmentDialog } from './PendingAppointmentDialog'
import type { PendingAppointmentView } from './PendingAppointmentDialog'

/**
 * Escuta o stream em tempo real (SSE) e exibe o popup pedindo para confirmar
 * (ou recusar) cada agendamento pendente feito pelo link público. Se o dono
 * fechar o aviso, o agendamento continua pendente e reaparece no sino.
 */
export function PendingBookingsListener() {
  const [queue, setQueue] = useState<PendingAppointmentView[]>([])
  const queryClient = useQueryClient()

  useEffect(() => {
    const token = getToken()
    if (!token) return
    const source = new EventSource(`${API_URL}/realtime/stream?token=${encodeURIComponent(token)}`)
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'pending-appointment' && data.appointment) {
          const appointment = data.appointment as PendingAppointmentView
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
  if (!current) return null

  return (
    <PendingAppointmentDialog
      appointment={current}
      extraCount={queue.length - 1}
      onClose={() => setQueue((q) => q.slice(1))}
      onResolved={() => setQueue((q) => q.slice(1))}
    />
  )
}
