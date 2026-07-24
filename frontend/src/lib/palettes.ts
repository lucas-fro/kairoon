import type { CSSProperties } from 'react'
import { darken, hexToChannels, hexToRgb, lighten } from './color'

/**
 * Paletas de cores prontas para personalizar o SISTEMA (painel) e o LINK
 * público de uma só vez. Cada paleta vira um conjunto de CSS custom properties
 * (`--primary`, `--secondary`, `--accent` + variações) que os tokens do
 * Tailwind consomem via `rgb(var(--x) / <alpha-value>)`. Trocar a paleta =
 * escrever essas variáveis em `document.documentElement` (painel) ou no wrapper
 * da página pública. Ver frontend/tailwind.config.ts e src/index.css.
 *
 * Regra de contraste: a cor `primary` de toda paleta é escura o suficiente para
 * texto branco (a sidebar e os botões primários usam `text-white`). As demais
 * cores da chrome (fundo, cards, tinta) continuam neutras e fixas — só o
 * "brand accent" muda, mantendo tudo legível em qualquer paleta.
 */
export interface Palette {
  key: string
  label: string
  primary: string
  primaryHover: string
  primaryActive: string
  secondary: string
  secondaryHover: string
  secondaryLight: string
  accent: string
}

/** Chave da paleta padrão (navy do design system original). */
export const DEFAULT_PALETTE_KEY = 'padrao'
/** Chave especial: cor livre escolhida no seletor (deriva a paleta do hex). */
export const CUSTOM_PALETTE_KEY = 'custom'

/**
 * Constrói uma paleta a partir de uma fatia da escala do Tailwind
 * (700 = primary, 600 = hover, 800 = active, 500 = secondary, 50/100 = tints).
 */
function scale(
  key: string,
  label: string,
  s: { c50: string; c100: string; c500: string; c600: string; c700: string; c800: string },
): Palette {
  return {
    key,
    label,
    primary: s.c700,
    primaryHover: s.c600,
    primaryActive: s.c800,
    secondary: s.c500,
    secondaryHover: s.c600,
    secondaryLight: s.c50,
    accent: s.c100,
  }
}

export const PALETTES: Palette[] = [
  // Padrão — navy original do Kairoon (idêntico aos tokens de sempre).
  {
    key: DEFAULT_PALETTE_KEY,
    label: 'Padrão',
    primary: '#1E2F5E',
    primaryHover: '#243A75',
    primaryActive: '#17264A',
    secondary: '#6EA8FE',
    secondaryHover: '#5592F7',
    secondaryLight: '#EAF2FF',
    accent: '#C7D9FF',
  },
  // Neutros
  {
    key: 'preto',
    label: 'Preto',
    primary: '#171717',
    primaryHover: '#262626',
    primaryActive: '#0A0A0A',
    secondary: '#A3A3A3',
    secondaryHover: '#737373',
    secondaryLight: '#F5F5F5',
    accent: '#E5E5E5',
  },
  {
    key: 'grafite',
    label: 'Grafite',
    primary: '#3F3F46',
    primaryHover: '#52525B',
    primaryActive: '#27272A',
    secondary: '#71717A',
    secondaryHover: '#52525B',
    secondaryLight: '#F4F4F5',
    accent: '#E4E4E7',
  },
  {
    key: 'cinza',
    label: 'Cinza',
    primary: '#475569',
    primaryHover: '#64748B',
    primaryActive: '#334155',
    secondary: '#94A3B8',
    secondaryHover: '#64748B',
    secondaryLight: '#F1F5F9',
    accent: '#E2E8F0',
  },
  // Quentes
  scale('vermelho', 'Vermelho', {
    c50: '#FEF2F2',
    c100: '#FEE2E2',
    c500: '#EF4444',
    c600: '#DC2626',
    c700: '#B91C1C',
    c800: '#991B1B',
  }),
  scale('laranja', 'Laranja', {
    c50: '#FFF7ED',
    c100: '#FFEDD5',
    c500: '#F97316',
    c600: '#EA580C',
    c700: '#C2410C',
    c800: '#9A3412',
  }),
  scale('amarelo', 'Amarelo', {
    c50: '#FFFBEB',
    c100: '#FEF3C7',
    c500: '#F59E0B',
    c600: '#D97706',
    c700: '#B45309',
    c800: '#92400E',
  }),
  {
    key: 'marrom',
    label: 'Marrom',
    primary: '#7A4522',
    primaryHover: '#8B5329',
    primaryActive: '#613618',
    secondary: '#B37A4A',
    secondaryHover: '#A9713F',
    secondaryLight: '#F5ECE2',
    accent: '#E7D3BE',
  },
  // Verdes
  scale('lima', 'Lima', {
    c50: '#F7FEE7',
    c100: '#ECFCCB',
    c500: '#84CC16',
    c600: '#65A30D',
    c700: '#4D7C0F',
    c800: '#3F6212',
  }),
  scale('verde', 'Verde', {
    c50: '#F0FDF4',
    c100: '#DCFCE7',
    c500: '#22C55E',
    c600: '#16A34A',
    c700: '#15803D',
    c800: '#166534',
  }),
  scale('esmeralda', 'Esmeralda', {
    c50: '#ECFDF5',
    c100: '#D1FAE5',
    c500: '#10B981',
    c600: '#059669',
    c700: '#047857',
    c800: '#065F46',
  }),
  scale('turquesa', 'Turquesa', {
    c50: '#F0FDFA',
    c100: '#CCFBF1',
    c500: '#14B8A6',
    c600: '#0D9488',
    c700: '#0F766E',
    c800: '#115E59',
  }),
  // Azuis / frios
  scale('ciano', 'Ciano', {
    c50: '#ECFEFF',
    c100: '#CFFAFE',
    c500: '#06B6D4',
    c600: '#0891B2',
    c700: '#0E7490',
    c800: '#155E75',
  }),
  scale('azul-claro', 'Azul-claro', {
    c50: '#F0F9FF',
    c100: '#E0F2FE',
    c500: '#0EA5E9',
    c600: '#0284C7',
    c700: '#0369A1',
    c800: '#075985',
  }),
  scale('azul', 'Azul', {
    c50: '#EFF6FF',
    c100: '#DBEAFE',
    c500: '#3B82F6',
    c600: '#2563EB',
    c700: '#1D4ED8',
    c800: '#1E40AF',
  }),
  scale('indigo', 'Índigo', {
    c50: '#EEF2FF',
    c100: '#E0E7FF',
    c500: '#6366F1',
    c600: '#4F46E5',
    c700: '#4338CA',
    c800: '#3730A3',
  }),
  // Roxos / rosas
  scale('violeta', 'Violeta', {
    c50: '#F5F3FF',
    c100: '#EDE9FE',
    c500: '#8B5CF6',
    c600: '#7C3AED',
    c700: '#6D28D9',
    c800: '#5B21B6',
  }),
  scale('roxo', 'Roxo', {
    c50: '#FAF5FF',
    c100: '#F3E8FF',
    c500: '#A855F7',
    c600: '#9333EA',
    c700: '#7E22CE',
    c800: '#6B21A8',
  }),
  scale('fucsia', 'Fúcsia', {
    c50: '#FDF4FF',
    c100: '#FAE8FF',
    c500: '#D946EF',
    c600: '#C026D3',
    c700: '#A21CAF',
    c800: '#86198F',
  }),
  scale('rosa', 'Rosa', {
    c50: '#FDF2F8',
    c100: '#FCE7F3',
    c500: '#EC4899',
    c600: '#DB2777',
    c700: '#BE185D',
    c800: '#9D174D',
  }),
]

export const PALETTE_MAP: Record<string, Palette> = Object.fromEntries(
  PALETTES.map((p) => [p.key, p]),
)

export const DEFAULT_PALETTE = PALETTE_MAP[DEFAULT_PALETTE_KEY]

/** Deriva uma paleta coerente a partir de uma única cor `#RRGGBB` (modo custom). */
export function customPaletteFromHex(hex: string): Palette {
  return {
    key: CUSTOM_PALETTE_KEY,
    label: 'Personalizado',
    primary: hex,
    primaryHover: lighten(hex, 0.12),
    primaryActive: darken(hex, 0.12),
    secondary: lighten(hex, 0.35),
    secondaryHover: lighten(hex, 0.22),
    secondaryLight: lighten(hex, 0.88),
    accent: lighten(hex, 0.75),
  }
}

/**
 * Resolve a paleta efetiva a partir do que está guardado no estabelecimento:
 * - chave de preset conhecida → o preset;
 * - `custom` + hex válido → paleta derivada do hex;
 * - qualquer outra coisa (null/legado) → null (mantém os defaults do :root).
 */
export function resolvePalette(
  paletteKey: string | null | undefined,
  themeColor: string | null | undefined,
): Palette | null {
  if (paletteKey && PALETTE_MAP[paletteKey]) return PALETTE_MAP[paletteKey]
  if (paletteKey === CUSTOM_PALETTE_KEY && themeColor && hexToRgb(themeColor)) {
    return customPaletteFromHex(themeColor)
  }
  return null
}

/** Nomes das CSS custom properties escritas por uma paleta. */
export const PALETTE_VAR_NAMES = [
  '--primary',
  '--primary-hover',
  '--primary-active',
  '--secondary',
  '--secondary-hover',
  '--secondary-light',
  '--accent',
] as const

/** Paleta → mapa de CSS vars (canais "r g b" para funcionar com opacidade). */
export function paletteToVars(p: Palette): Record<string, string> {
  return {
    '--primary': hexToChannels(p.primary),
    '--primary-hover': hexToChannels(p.primaryHover),
    '--primary-active': hexToChannels(p.primaryActive),
    '--secondary': hexToChannels(p.secondary),
    '--secondary-hover': hexToChannels(p.secondaryHover),
    '--secondary-light': hexToChannels(p.secondaryLight),
    '--accent': hexToChannels(p.accent),
  }
}

/** Estilo inline (para o wrapper da página pública). */
export function paletteStyle(p: Palette): CSSProperties {
  return paletteToVars(p) as CSSProperties
}

/** Escreve as vars da paleta num elemento (ou limpa, voltando aos defaults). */
export function applyPaletteVars(el: HTMLElement, p: Palette | null): void {
  if (!p) {
    for (const name of PALETTE_VAR_NAMES) el.style.removeProperty(name)
    return
  }
  const vars = paletteToVars(p)
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value)
}
