import type { LucideIcon } from 'lucide-react'
import { Banknote, CreditCard, QrCode, Receipt, Wallet } from 'lucide-react'
import { SlideShell } from '../SlideShell'

const PAYMENTS: { icon: LucideIcon; label: string; value: string; share: number }[] = [
  { icon: QrCode, label: 'Pix', value: 'R$ 520,00', share: 42 },
  { icon: CreditCard, label: 'Cartão', value: 'R$ 445,00', share: 36 },
  { icon: Banknote, label: 'Dinheiro', value: 'R$ 275,00', share: 22 },
]

const COMMISSIONS = [
  { name: 'Carlos Andrade', value: 'R$ 1.180,00' },
  { name: 'Juliana Prado', value: 'R$ 1.045,00' },
  { name: 'Rafael Nunes', value: 'R$ 955,00' },
]

export function FinanceSlide() {
  return (
    <SlideShell
      eyebrow="Financeiro"
      title="No fim do dia, o caixa já está fechado"
      description="Cada atendimento finalizado entra no caixa com a forma de pagamento certa. A comissão de cada profissional sai calculada, e os custos fixos entram todo mês sozinhos."
    >
      <div className="grid w-full max-w-4xl items-start gap-4 text-left lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <article className="rounded-xl bg-surface p-5 shadow-elevated">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-tertiary">
            <Wallet className="h-3.5 w-3.5" />
            Caixa de hoje
          </div>
          <p className="mt-1 font-display text-3xl font-semibold text-ink">R$ 1.240,00</p>

          <ul className="mt-5 space-y-3">
            {PAYMENTS.map((payment) => (
              <li key={payment.label}>
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="flex items-center gap-2 font-medium text-ink-secondary">
                    <payment.icon className="h-4 w-4 text-ink-tertiary" />
                    {payment.label}
                  </span>
                  <span className="tabular-nums font-medium text-ink">{payment.value}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-divider">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${payment.share}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <div className="flex flex-col gap-4">
          <article className="rounded-xl bg-surface p-5 shadow-card">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Comissões do mês
            </h3>
            <ul className="mt-3 divide-y divide-line-divider">
              {COMMISSIONS.map((person) => (
                <li key={person.name} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 truncate text-[13px] text-ink-secondary">
                    {person.name}
                  </span>
                  <span className="shrink-0 tabular-nums font-display text-sm font-semibold text-ink">
                    {person.value}
                  </span>
                </li>
              ))}
            </ul>
          </article>

          <article className="flex items-start gap-3 rounded-xl bg-surface p-4 shadow-card">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary-light text-primary">
              <Receipt className="h-4 w-4" />
            </span>
            <p className="text-[13px] leading-relaxed text-ink-secondary">
              Aluguel, energia e salários entram como custo recorrente. O lucro que aparece no
              relatório já desconta tudo isso.
            </p>
          </article>
        </div>
      </div>
    </SlideShell>
  )
}
