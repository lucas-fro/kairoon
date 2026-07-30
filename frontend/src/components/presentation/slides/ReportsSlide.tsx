import { SlideShell } from '../SlideShell'

/** Faturamento mensal fictício, em reais. Série única: uma cor só, sem legenda. */
const REVENUE = [
  { month: 'Fev', value: 18400 },
  { month: 'Mar', value: 19700 },
  { month: 'Abr', value: 21200 },
  { month: 'Mai', value: 20500 },
  { month: 'Jun', value: 24100 },
  { month: 'Jul', value: 26800 },
]

/** Altura da barra mais alta. O resto escala em cima dela, a partir do zero. */
const MAX_BAR_PX = 152

const TOP_SERVICES = [
  { name: 'Corte + Barba', share: 34 },
  { name: 'Corte Masculino', share: 28 },
  { name: 'Barba Completa', share: 19 },
]

const formatThousands = (value: number) =>
  `R$ ${(value / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`

export function ReportsSlide() {
  const peak = Math.max(...REVENUE.map((item) => item.value))

  return (
    <SlideShell
      eyebrow="Relatórios"
      title="Pare de decidir no achismo"
      description="Faturamento mês a mês, serviços que mais vendem, profissional que mais produz e os horários que ficam vazios. Dá para ver o que sustenta o negócio e o que só ocupa cadeira."
    >
      <div className="grid w-full max-w-4xl items-start gap-4 text-left lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <figure className="rounded-xl bg-surface p-5 shadow-elevated">
          <figcaption className="text-[11px] uppercase tracking-wide text-ink-tertiary">
            Faturamento por mês
          </figcaption>

          <div className="mt-4 flex h-48 items-end gap-2 border-b border-line">
            {REVENUE.map((item) => (
              <div key={item.month} className="flex flex-1 flex-col items-center justify-end gap-1">
                {/* Rótulo direto só no pico: o resto se lê pela altura. */}
                {item.value === peak && (
                  <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-ink">
                    {formatThousands(item.value)}
                  </span>
                )}
                <div
                  className="w-full rounded-t-md bg-primary"
                  style={{ height: `${Math.round((item.value / peak) * MAX_BAR_PX)}px` }}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex gap-2">
            {REVENUE.map((item) => (
              <span key={item.month} className="flex-1 text-center text-[11px] text-ink-tertiary">
                {item.month}
              </span>
            ))}
          </div>
        </figure>

        <div className="flex flex-col gap-4">
          <article className="rounded-xl bg-surface p-5 shadow-card">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Serviços que mais vendem
            </h3>
            <ul className="mt-3 space-y-3">
              {TOP_SERVICES.map((service) => (
                <li key={service.name}>
                  <div className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0 truncate text-ink-secondary">{service.name}</span>
                    <span className="shrink-0 tabular-nums font-medium text-ink">
                      {service.share}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line-divider">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${service.share}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-xl bg-surface p-5 shadow-card">
            <h3 className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Ocupação da agenda
            </h3>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">72%</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-secondary">
              As terças de manhã são o buraco. É ali que vale soltar uma promoção.
            </p>
          </article>
        </div>
      </div>

      <p className="text-xs text-ink-tertiary">Números de exemplo, de uma barbearia fictícia.</p>
    </SlideShell>
  )
}
