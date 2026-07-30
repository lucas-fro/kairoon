import { AlertTriangle, PackageCheck, ShoppingCart } from 'lucide-react'
import { cn } from '../../../lib/format'
import { Badge } from '../../ui/Badge'
import { SlideShell } from '../SlideShell'

const PRODUCTS = [
  { name: 'Pomada Modeladora', brand: 'Don Alcides', qty: 38, min: 10 },
  { name: 'Óleo para Barba', brand: 'Viking', qty: 21, min: 8 },
  { name: 'Shampoo Anticaspa', brand: 'QOD Barber', qty: 6, min: 10 },
  { name: 'Cera Fixadora', brand: 'Bem Barba', qty: 3, min: 8 },
]

export function StockSlide() {
  return (
    <SlideShell
      eyebrow="Estoque"
      title="Vendeu o produto, o estoque já sabe"
      description="A venda entra junto com o atendimento e a quantidade cai sozinha. Quando um item chega no mínimo que você definiu, o sistema avisa antes de o cliente ouvir um não."
    >
      <div className="w-full max-w-3xl rounded-xl bg-surface p-5 text-left shadow-elevated">
        <ul className="divide-y divide-line-divider">
          {PRODUCTS.map((product) => {
            const low = product.qty <= product.min
            const fill = Math.min(100, Math.round((product.qty / (product.min * 4)) * 100))
            return (
              <li key={product.name} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <h3 className="truncate text-[15px] font-medium text-ink">{product.name}</h3>
                    {low && (
                      <Badge tone="warning">
                        <AlertTriangle className="h-3 w-3" /> Repor
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-ink-tertiary">{product.brand}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line-divider">
                    <div
                      className={cn('h-full rounded-full', low ? 'bg-warning' : 'bg-primary')}
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-lg font-semibold tabular-nums text-ink">
                    {product.qty}
                  </p>
                  <p className="text-[11px] text-ink-tertiary">mín. {product.min}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <li className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <ShoppingCart className="h-4 w-4 text-ink-tertiary" />
          Baixa automática na venda
        </li>
        <li className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <AlertTriangle className="h-4 w-4 text-ink-tertiary" />
          Alerta de estoque mínimo
        </li>
        <li className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <PackageCheck className="h-4 w-4 text-ink-tertiary" />
          Custo e margem por produto
        </li>
      </ul>
    </SlideShell>
  )
}
