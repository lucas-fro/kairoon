import { useLayoutEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { usePlan } from '../../hooks/usePlan'
import { applyPaletteVars, paletteToVars, resolvePalette } from '../../lib/palettes'

const CACHE_KEY = 'kairoon:palette-vars'

/**
 * Aplica a paleta escolhida pelo estabelecimento no PAINEL inteiro, escrevendo
 * as CSS vars da marca em `document.documentElement`. Espelha o gate de
 * personalização: sem a feature, volta aos defaults do :root (navy).
 *
 * O link público é tematizado à parte (no wrapper da própria página), então
 * este componente só existe dentro do painel autenticado. Não renderiza nada.
 */
export function PaletteThemeApplier() {
  const { establishment } = useAuth()
  const { data: plan } = usePlan()

  // Prime do cache (1x, antes do primeiro paint) p/ evitar o flash navy→cor a
  // cada carregamento de quem já tem paleta. Limpa ao sair do painel.
  useLayoutEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const vars = JSON.parse(raw) as Record<string, string>
        for (const [k, v] of Object.entries(vars)) {
          document.documentElement.style.setProperty(k, v)
        }
      }
    } catch {
      /* localStorage indisponível, ignora */
    }
    return () => applyPaletteVars(document.documentElement, null)
  }, [])

  // Reconcilia com os dados reais (paleta salva + gate de plano).
  useLayoutEffect(() => {
    if (!establishment) return
    const root = document.documentElement
    const hasPersonalizacao = plan
      ? plan.features.personalizacao
      : establishment.plan !== 'free'
    const palette = hasPersonalizacao
      ? resolvePalette(establishment.palette, establishment.themeColor)
      : null
    applyPaletteVars(root, palette)
    try {
      if (palette) localStorage.setItem(CACHE_KEY, JSON.stringify(paletteToVars(palette)))
      else localStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignora */
    }
  }, [establishment, plan])

  return null
}
