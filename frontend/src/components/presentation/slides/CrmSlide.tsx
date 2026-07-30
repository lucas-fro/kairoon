import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
  Gift,
  History,
  Scissors,
  Star,
  UserRoundSearch,
} from 'lucide-react'
import { Badge } from '../../ui/Badge'
import { SlideShell } from '../SlideShell'

const FACTS: { icon: LucideIcon; label: string; value: string }[] = [
  { icon: CalendarDays, label: 'Visitas', value: '14' },
  { icon: CircleDollarSign, label: 'Total gasto', value: 'R$ 640,00' },
  { icon: Clock, label: 'Última visita', value: 'há 3 semanas' },
  { icon: Scissors, label: 'Serviço favorito', value: 'Corte + Barba' },
]

const USES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: History,
    title: 'Histórico que se escreve sozinho',
    text: 'Todo atendimento entra na ficha com valor, profissional e data. Você abre o nome e sabe com quem está falando.',
  },
  {
    icon: UserRoundSearch,
    title: 'Descubra quem sumiu',
    text: 'Filtre quem não aparece há meses e chame de volta. É mais barato do que buscar cliente novo.',
  },
  {
    icon: Gift,
    title: 'Fidelidade e aniversário',
    text: 'Cartão de selos, pontos e datas especiais controlados pelo sistema, não por um caderninho.',
  },
]

export function CrmSlide() {
  return (
    <SlideShell
      eyebrow="Seus clientes"
      title="Sua carteira de clientes vira um ativo, não uma lista de telefones"
      description="Cada agendamento alimenta a ficha sozinho. Você para de depender da memória para saber quem é bom cliente, quem sumiu e quem está quase ganhando um brinde."
    >
      <div className="grid w-full max-w-4xl items-start gap-4 text-left lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <article className="rounded-xl bg-surface p-5 shadow-elevated">
          <header className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-light font-display text-base font-semibold text-primary">
              MT
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-semibold text-ink">
                Marcos Teixeira
              </h3>
              <p className="truncate text-[13px] text-ink-secondary">(11) 98765-4321</p>
            </div>
            <Badge tone="brand" className="ml-auto shrink-0">
              <Star className="h-3 w-3" /> Fiel
            </Badge>
          </header>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            {FACTS.map((fact) => (
              <div key={fact.label} className="rounded-lg bg-background p-3">
                <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-tertiary">
                  <fact.icon className="h-3.5 w-3.5" />
                  {fact.label}
                </dt>
                <dd className="mt-1 truncate font-display text-sm font-semibold text-ink">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 border-t border-line-divider pt-4">
            <div className="flex items-center justify-between text-[13px]">
              <span className="font-medium text-ink-secondary">Cartão fidelidade</span>
              <span className="tabular-nums text-ink-tertiary">7 de 10 selos</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-line-divider">
              <div className="h-full w-[70%] rounded-full bg-primary" />
            </div>
          </div>
        </article>

        <ul className="flex flex-col gap-3">
          {USES.map((use) => (
            <li key={use.title} className="flex gap-3 rounded-xl bg-surface p-4 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary-light text-primary">
                <use.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-[15px] font-semibold text-ink">{use.title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-secondary">{use.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  )
}
