import { minutesToTime } from '../../lib/dates'

/** Duração de cada slot da grade (e passo dos selects de horário) */
export const SLOT_MINUTES = 15

/** Gera opções 'HH:mm' de 15 em 15min dentro do expediente (último início = fim - passo) */
export function buildTimeOptions(startMinutes: number, endMinutes: number): string[] {
  const options: string[] = []
  for (let minutes = startMinutes; minutes < endMinutes; minutes += SLOT_MINUTES) {
    options.push(minutesToTime(minutes))
  }
  return options
}
