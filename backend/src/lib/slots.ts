import { timeToMinutes, minutesToTime } from './datetime'

export interface BusyInterval {
  startTime: string
  endTime: string
}

export interface ComputeSlotsOptions {
  opensAt: string
  closesAt: string
  durationMinutes: number
  busy: BusyInterval[]
  /** Passo entre horários ofertados (padrão 30min) */
  stepMinutes?: number
  /** Minutos mínimos do início (usado para excluir horários já passados hoje) */
  minStartMinutes?: number
}

/**
 * Gera os horários de início disponíveis dentro do expediente, garantindo que
 * o serviço inteiro (start + duração) caiba antes do fechamento e não
 * sobreponha nenhum agendamento existente.
 */
export function computeAvailableSlots(options: ComputeSlotsOptions): string[] {
  const { opensAt, closesAt, durationMinutes, busy, stepMinutes = 15, minStartMinutes } = options

  const open = timeToMinutes(opensAt)
  const close = timeToMinutes(closesAt)
  if (close <= open || durationMinutes <= 0) return []

  const busyIntervals = busy.map((b) => ({
    start: timeToMinutes(b.startTime),
    end: timeToMinutes(b.endTime),
  }))

  const slots: string[] = []
  for (let start = open; start + durationMinutes <= close; start += stepMinutes) {
    if (minStartMinutes !== undefined && start < minStartMinutes) continue
    const end = start + durationMinutes
    const hasConflict = busyIntervals.some((b) => start < b.end && end > b.start)
    if (!hasConflict) slots.push(minutesToTime(start))
  }
  return slots
}

/** true se [startA, endA) sobrepõe [startB, endB) — horários 'HH:mm' */
export function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(endA) > timeToMinutes(startB)
}

/** Normaliza telefone para somente dígitos */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}
