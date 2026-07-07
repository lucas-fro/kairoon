import { formatBRL } from './format'
import type { CouponDiscountType } from '../types/api'

/** 'percent' 10 → '10%'; 'fixed' 2000 → 'R$ 20,00'; 'free_service' → 'Serviço grátis' */
export function describeCouponDiscount(
  discountType: CouponDiscountType,
  discountValue: number,
): string {
  if (discountType === 'percent') return `${discountValue}%`
  if (discountType === 'fixed') return formatBRL(discountValue)
  return 'Serviço grátis'
}

/** Validade legível: 'até 31/12', 'de 01/08 até 31/12' ou 'sem validade' */
export function describeCouponValidity(
  validFrom: string | null,
  validUntil: string | null,
): string {
  const short = (dateStr: string) => {
    const [, month, day] = dateStr.split('-')
    return `${day}/${month}`
  }
  if (validFrom && validUntil) return `de ${short(validFrom)} até ${short(validUntil)}`
  if (validUntil) return `até ${short(validUntil)}`
  if (validFrom) return `a partir de ${short(validFrom)}`
  return 'sem validade'
}
