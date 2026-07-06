/**
 * Cor de texto legível (branco ou tinta escura) sobre um fundo `#RRGGBB`,
 * baseada na luminância relativa (WCAG). Usado para manter contraste em cima de
 * uma cor de marca arbitrária (banner, botões).
 */
export function readableTextColor(hex: string): '#FFFFFF' | '#0F172A' {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return '#FFFFFF'

  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  if ([r, g, b].some((c) => Number.isNaN(c))) return '#FFFFFF'

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

  // Limiar ~0.5: fundos claros recebem tinta escura; escuros, branco.
  return luminance > 0.45 ? '#0F172A' : '#FFFFFF'
}
