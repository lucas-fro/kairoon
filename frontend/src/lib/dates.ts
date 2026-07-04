/**
 * Datas são strings 'YYYY-MM-DD' e horários 'HH:mm' (mesma convenção do
 * backend). NUNCA use new Date('YYYY-MM-DD') — o parse UTC desloca o dia.
 */

export const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
export const WEEKDAY_LABELS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

export function getDayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay()
}

/** Segunda-feira da semana da data informada */
export function startOfWeek(dateStr: string): string {
  const dow = getDayOfWeek(dateStr)
  const diff = dow === 0 ? -6 : 1 - dow
  return addDays(dateStr, diff)
}

/** Os 7 dias da semana (seg→dom) a partir de qualquer data */
export function getWeekDays(dateStr: string): string[] {
  const monday = startOfWeek(dateStr)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function startOfMonthStr(): string {
  return `${todayStr().slice(0, 7)}-01`
}

export function isSameDay(a: string, b: string): boolean {
  return a === b
}
