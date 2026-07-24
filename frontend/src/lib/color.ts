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

/** `#RRGGBB` → `{ r, g, b }` (0-255) ou null se o hex for inválido. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) return null
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  if ([r, g, b].some((c) => Number.isNaN(c))) return null
  return { r, g, b }
}

/**
 * `#RRGGBB` → canais `"r g b"` (formato dos CSS custom properties usados pelos
 * tokens do Tailwind: `rgb(var(--primary) / <alpha-value>)`). Hex inválido cai
 * no navy do sistema (30 47 94 = #1E2F5E) para nunca gerar cor quebrada.
 */
export function hexToChannels(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '30 47 94'
  return `${rgb.r} ${rgb.g} ${rgb.b}`
}

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
const toHex2 = (n: number) => clamp(n).toString(16).padStart(2, '0')

/** Mistura `hex` com `target` na proporção `weight` (0..1). weight=1 → target. */
export function mix(hex: string, target: string, weight: number): string {
  const a = hexToRgb(hex)
  const b = hexToRgb(target)
  if (!a || !b) return hex
  const w = Math.max(0, Math.min(1, weight))
  return `#${toHex2(a.r + (b.r - a.r) * w)}${toHex2(a.g + (b.g - a.g) * w)}${toHex2(a.b + (b.b - a.b) * w)}`
}

/** Clareia em direção ao branco. */
export const lighten = (hex: string, amount: number) => mix(hex, '#FFFFFF', amount)
/** Escurece em direção ao preto. */
export const darken = (hex: string, amount: number) => mix(hex, '#000000', amount)
