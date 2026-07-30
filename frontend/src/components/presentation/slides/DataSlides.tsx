import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  CircleDollarSign,
  Clock,
  MessageCircle,
  PackageMinus,
  Scissors,
  Star,
  TrendingUp,
} from 'lucide-react'
import { cn } from '../../../lib/format'
import { Badge } from '../../ui/Badge'
import { SlideShell } from '../SlideShell'

const CLIENT_FACTS: { icon: LucideIcon; label: string; value: string }[] = [
  { icon: CalendarDays, label: 'Visitas', value: '14' },
  { icon: CircleDollarSign, label: 'Total gasto', value: 'R$ 640,00' },
  { icon: Clock, label: 'Última visita', value: 'há 3 semanas' },
  { icon: Scissors, label: 'Serviço favorito', value: 'Corte + Barba' },
]

export function ClientSlide() {
  return (
    <SlideShell
      eyebrow="Seus dados"
      title="A ficha do cliente se preenche sozinha"
      description="A cada agendamento o sistema guarda histórico, gastos e preferências. Você abre o nome e sabe na hora com quem está falando."
    >
      <article className="w-full max-w-md rounded-xl bg-surface p-5 text-left shadow-elevated">
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
          {CLIENT_FACTS.map((fact) => (
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
    </SlideShell>
  )
}

const AUTOMATIONS: { icon: LucideIcon; label: string; value: string; tone: string }[] = [
  {
    icon: TrendingUp,
    label: 'Caixa de hoje',
    value: 'R$ 1.240,00',
    tone: 'bg-success-light text-success-dark',
  },
  {
    icon: CircleDollarSign,
    label: 'Comissões do mês',
    value: 'R$ 3.180,00',
    tone: 'bg-secondary-light text-primary',
  },
  {
    icon: PackageMinus,
    label: 'Estoque baixo',
    value: '2 produtos',
    tone: 'bg-warning-light text-warning-dark',
  },
]

export function AutomationSlide() {
  return (
    <SlideShell
      eyebrow="No automático"
      title="Menos tarefa manual, mais atendimento"
      description="Enquanto você atende, o sistema fecha o caixa, calcula comissão, baixa o estoque e lembra o cliente do horário."
    >
      <ul className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {AUTOMATIONS.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-card sm:flex-col sm:items-start sm:gap-3"
          >
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                item.tone,
              )}
            >
              <item.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink-tertiary">{item.label}</p>
              <p className="font-display text-lg font-semibold text-ink">{item.value}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex w-full max-w-md items-start gap-2.5 rounded-xl bg-surface p-4 text-left shadow-card">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-light text-success-dark">
          <MessageCircle className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-tertiary">
            Lembrete enviado na véspera
          </p>
          <p className="mt-1 rounded-xl rounded-tl-none bg-success-light px-3 py-2 text-[13px] leading-relaxed text-success-dark">
            Oi, Marcos! Passando para lembrar do seu horário amanhã às 15:00. Até lá!
          </p>
        </div>
      </div>
    </SlideShell>
  )
}
