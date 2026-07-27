/**
 * Datas são strings 'YYYY-MM-DD' e horários strings 'HH:mm', sempre no fuso
 * local do servidor. Nunca use `new Date('YYYY-MM-DD')` para extrair o dia da
 * semana: o parse é feito em UTC e desloca o dia em fusos negativos.
 */

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function addMinutesToTime(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes)
}

export function getDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

export function todayStr(): string {
  return toDateStr(new Date())
}

export function nowMinutes(): number {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

/**
 * Avança `months` meses limitando o dia ao último dia do mês-alvo (ex.: 31/01 +
 * 1 mês = 28/02). Usado para agendar as parcelas do crédito recebido mês a mês.
 */
export function addMonthsClamped(dateStr: string, months: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const lastDayOfTarget = new Date(year, month - 1 + months + 1, 0).getDate()
  return toDateStr(new Date(year, month - 1 + months, Math.min(day, lastDayOfTarget)))
}

/** Último dia do mês da data ('YYYY-MM-DD'). */
export function endOfMonth(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  return toDateStr(new Date(year, month, 0))
}

/**
 * Constrói o Date local a partir de 'YYYY-MM-DD'. Existe para não cair no
 * `new Date('YYYY-MM-DD')`, que parseia em UTC e desloca o dia em fusos
 * negativos (o Brasil inteiro).
 */
export function parseDateStr(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Minutos entre agora e o instante ('YYYY-MM-DD' + 'HH:mm'), negativo se já
 * passou. Tudo em hora local: os agendamentos guardam data e hora em colunas
 * separadas, e fazer essa conta em UTC deslocaria o dia.
 */
export function minutesUntil(dateStr: string, time: string, now: Date = new Date()): number {
  const daysApart = Math.round(
    (parseDateStr(dateStr).getTime() - parseDateStr(toDateStr(now)).getTime()) / 86_400_000,
  )
  return daysApart * 1440 + timeToMinutes(time) - (now.getHours() * 60 + now.getMinutes())
}

/** 'YYYY-MM-DD' → '28/07' */
export function formatDayMonthBr(dateStr: string): string {
  const [, month, day] = dateStr.split('-')
  return `${day}/${month}`
}

/** 'YYYY-MM-DD' → 'Sexta-feira' (capitalizado, pt-BR) */
export function weekdayNamePt(dateStr: string): string {
  const name = parseDateStr(dateStr).toLocaleDateString('pt-BR', { weekday: 'long' })
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Valida que a string é uma data de calendário real (ex: rejeita 2026-02-30),
 * que passaria no regex mas viraria erro 500 no Postgres.
 */
export function isValidDateStr(dateStr: string): boolean {
  if (!DATE_REGEX.test(dateStr)) return false
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}
