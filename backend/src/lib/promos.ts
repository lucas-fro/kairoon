/**
 * Campanha promocional da assinatura do Kairoon. NÃO confundir com o módulo
 * `modules/coupons`: aquele é o cupom que o SALÃO dá pros clientes finais dele
 * em agendamentos (preso a establishmentId/clients/appointments). Este aqui é
 * desconto na fatura que o Kairoon cobra do salão.
 *
 * Fica hardcoded de propósito: não há banco nem tela de admin para campanhas.
 * Para encerrar a promoção, troque `ACTIVE_PROMO` por `null` e dê deploy: a
 * rota GET /payments/promo passa a devolver null e o card some do painel
 * sozinho, sem precisar mexer no frontend.
 */
export const ACTIVE_PROMO: Promo | null = {
  code: 'BEMVINDO10',
  percentOff: 10,
}

export interface Promo {
  code: string
  /** Percentual de desconto (10 = 10%). */
  percentOff: number
}

/** Códigos são comparados sem espaço e sem diferenciar maiúsculas. */
export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase()
}

/** A promoção ativa, se o código digitado for ela. Null em qualquer outro caso. */
export function resolvePromo(code: string): Promo | null {
  if (!ACTIVE_PROMO) return null
  return normalizePromoCode(code) === ACTIVE_PROMO.code ? ACTIVE_PROMO : null
}

/**
 * Valor com desconto, em CENTAVOS. A conta é feita em centavos e só depois
 * convertida para reais (centsToReais): arredondar em reais deixaria fração de
 * centavo no valor enviado ao gateway.
 */
export function applyPromoCents(cents: number, percentOff: number): number {
  return Math.round((cents * (100 - percentOff)) / 100)
}
