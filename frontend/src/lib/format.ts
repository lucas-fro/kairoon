export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Converte texto digitado ("45", "45,90", "R$ 45,90") em centavos */
export function parseBRLToCents(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
  const parsed = Number.parseFloat(cleaned)
  if (Number.isNaN(parsed)) return 0
  return Math.round(parsed * 100)
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/** Formata dígitos como telefone BR: (11) 98765-4321 */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Valida um telefone celular brasileiro (aceita código do país 55 opcional).
 * Exige 11 dígitos (DDD + 9 + 8 dígitos), com o 3º dígito igual a 9. Não aceita
 * telefone fixo.
 */
export function isValidPhone(value: string): boolean {
  let digits = onlyDigits(value)
  if (digits.length === 13 && digits.startsWith('55')) digits = digits.slice(2)
  if (digits.length !== 11) return false
  if (Number(digits.slice(0, 2)) < 11) return false // DDD válido começa em 11
  return digits[2] === '9'
}

/** Formata como CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) pelo tamanho */
export function formatDocument(value: string): string {
  const digits = onlyDigits(value).slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** CPF (11 dígitos) ou CNPJ (14 dígitos) */
export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value)
  return digits.length === 11 || digits.length === 14
}

/** Formata CPF: 000.000.000-00 */
export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function isValidCpf(value: string): boolean {
  return onlyDigits(value).length === 11
}

/** Formata CNPJ: 00.000.000/0000-00 */
export function formatCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function isValidCnpj(value: string): boolean {
  return onlyDigits(value).length === 14
}

/** Formata CEP: 00000-000 */
export function formatCep(value: string): string {
  return onlyDigits(value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

export function isValidCep(value: string): boolean {
  return onlyDigits(value).length === 8
}

/** 'YYYY-MM-DD' → '02/07/2026' */
export function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

/** 'YYYY-MM' → 'julho de 2026' */
export function formatMonthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** 'YYYY-MM-DD' → 'quinta-feira, 2 de julho' */
export function formatDateLong(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h${rest}min`
}

/** Junta classes condicionalmente (mini clsx) */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
