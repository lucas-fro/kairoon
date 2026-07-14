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

/**
 * Sanitiza a entrada de um slug enquanto o usuário digita: minúsculas, sem
 * acentos, espaços/underscores viram hífen e caracteres inválidos são
 * descartados. Mantém um hífen final (do espaço recém-digitado) para não
 * atrapalhar a digitação da próxima palavra.
 */
export function formatSlugInput(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[\s_]+/g, '-') // espaços e underscore viram hífen
    .replace(/[^a-z0-9-]/g, '') // descarta o que não for permitido
    .replace(/-+/g, '-') // colapsa hífens repetidos
    .replace(/^-+/, '') // sem hífen no início
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

/**
 * Máscara de data enquanto o usuário digita: agrupa os dígitos em 'DD/MM/AAAA'.
 * Ex.: '02072026' → '02/07/2026', '0207' → '02/07'.
 */
export function maskDateBR(value: string): string {
  const digits = onlyDigits(value).slice(0, 8)
  const day = digits.slice(0, 2)
  const month = digits.slice(2, 4)
  const year = digits.slice(4, 8)
  let out = day
  if (month) out += `/${month}`
  if (year) out += `/${year}`
  return out
}

/** 'YYYY-MM-DD' → '02/07/2026' (retorna '' se vazio/incompleto). */
export function isoToDateBR(iso: string | null | undefined): string {
  if (!iso || iso.length < 10) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return ''
  return `${day}/${month}/${year}`
}

/**
 * '02/07/2026' → '2026-07-02' para enviar ao backend.
 * Retorna '' se a data estiver incompleta ou não for um dia válido de calendário.
 */
export function dateBRToIso(value: string): string {
  const digits = onlyDigits(value)
  if (digits.length !== 8) return ''
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  const year = Number(digits.slice(4, 8))
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Uma data BR está completa e é um dia de calendário válido? */
export function isValidDateBR(value: string): boolean {
  return dateBRToIso(value) !== ''
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

/**
 * Tempo relativo curto em pt-BR a partir de um timestamp ISO: 'agora',
 * 'há 5 min', 'há 2 h', 'há 3 d', 'há 2 sem', 'há 4 meses', 'há 1 ano'.
 */
export function timeAgo(from: string | Date, now: Date = new Date()): string {
  const then = typeof from === 'string' ? new Date(from) : from
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000)
  if (Number.isNaN(seconds) || seconds < 45) return 'agora'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `há ${days} d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `há ${weeks} sem`
  const months = Math.floor(days / 30)
  if (months < 12) return `há ${months} ${months === 1 ? 'mês' : 'meses'}`
  const years = Math.floor(days / 365)
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`
}

/** Junta classes condicionalmente (mini clsx) */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
