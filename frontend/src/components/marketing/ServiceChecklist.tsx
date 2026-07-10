import { formatBRL } from '../../lib/format'

interface ServiceChecklistProps {
  services: { id: string; name: string; priceCents: number }[]
  selected: string[]
  onToggle: (id: string) => void
}

/**
 * Lista de serviços com checkbox para escolher um ou mais. Usada nas recompensas
 * (fidelidade e pontos) do tipo "serviço grátis". Nenhum selecionado = qualquer
 * serviço. Mesmo padrão visual da restrição de serviços dos cupons.
 */
export function ServiceChecklist({ services, selected, onToggle }: ServiceChecklistProps) {
  if (services.length === 0) {
    return (
      <p className="rounded-lg bg-background px-3 py-4 text-center text-xs text-ink-tertiary">
        Nenhum serviço ativo encontrado.
      </p>
    )
  }
  return (
    <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-line p-2">
      {services.map((s) => (
        <label
          key={s.id}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background"
        >
          <input
            type="checkbox"
            checked={selected.includes(s.id)}
            onChange={() => onToggle(s.id)}
            className="h-4 w-4 rounded border-line accent-primary"
          />
          <span className="flex-1 truncate text-sm text-ink">{s.name}</span>
          <span className="shrink-0 text-xs text-ink-tertiary">{formatBRL(s.priceCents)}</span>
        </label>
      ))}
    </div>
  )
}
