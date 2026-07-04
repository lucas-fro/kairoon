/**
 * Cores de gráfico do Kairoon — ÚNICO lugar do frontend (além do
 * tailwind.config.ts) autorizado a conter hex. São variantes "chart-grade" da
 * paleta da marca, validadas para daltonismo (ΔE > 90 em protan/deutan/tritan)
 * e contraste >= 3:1 sobre a superfície do card.
 * Texto de eixo/tooltip usa cinza — nunca a cor da série.
 */
export const CHART_COLORS = {
  /** Entradas — azul chart-grade da família da marca */
  income: '#3B7DE0',
  /** Saídas — âmbar de contraste, seguro para CVD contra o azul */
  expense: '#D97706',
  /** Série única (serviços, ocupação) — mesmo azul chart-grade */
  series: '#3B7DE0',
  /** Linhas de grade horizontais (token line-divider) */
  grid: '#EEF2F7',
  /** Texto de eixos, ticks e rótulos (token ink-tertiary) */
  axisText: '#94A3B8',
} as const
