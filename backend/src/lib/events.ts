/**
 * Barramento de eventos em memória (por processo) para push em tempo real via
 * SSE. Cada estabelecimento tem um conjunto de handlers (conexões abertas).
 */
type Handler = (event: unknown) => void

const channels = new Map<string, Set<Handler>>()

export function subscribe(establishmentId: string, handler: Handler): () => void {
  let set = channels.get(establishmentId)
  if (!set) {
    set = new Set()
    channels.set(establishmentId, set)
  }
  set.add(handler)
  return () => {
    const current = channels.get(establishmentId)
    if (!current) return
    current.delete(handler)
    if (current.size === 0) channels.delete(establishmentId)
  }
}

export function publish(establishmentId: string, event: unknown): void {
  const set = channels.get(establishmentId)
  if (!set) return
  for (const handler of set) {
    try {
      handler(event)
    } catch {
      // conexão pode ter caído; ignora
    }
  }
}
