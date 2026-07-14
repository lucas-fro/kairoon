import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface HeaderSlotValue {
  content: ReactNode
  setContent: (content: ReactNode) => void
}

const HeaderSlotContext = createContext<HeaderSlotValue | null>(null)

/**
 * Permite que uma página injete conteúdo na barra do topo (AppHeader), como a
 * busca da Agenda. A página usa `useHeaderSlot(...)` e o AppHeader renderiza
 * `content`.
 */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<ReactNode>(null)
  const value = useMemo(() => ({ content, setContent }), [content])
  return <HeaderSlotContext.Provider value={value}>{children}</HeaderSlotContext.Provider>
}

/** Lê o conteúdo atual do slot (usado pelo AppHeader). */
export function useHeaderSlotContent(): ReactNode {
  const ctx = useContext(HeaderSlotContext)
  return ctx?.content ?? null
}

/**
 * Define o conteúdo do slot enquanto o componente estiver montado e limpa ao
 * desmontar. `node` deve ser estável (memoize os callbacks internos) para não
 * re-injetar a cada render.
 */
export function useHeaderSlot(node: ReactNode) {
  const ctx = useContext(HeaderSlotContext)
  const setContent = ctx?.setContent
  const set = useCallback(
    (n: ReactNode) => setContent?.(n),
    [setContent],
  )
  useEffect(() => {
    set(node)
    return () => set(null)
  }, [set, node])
}
