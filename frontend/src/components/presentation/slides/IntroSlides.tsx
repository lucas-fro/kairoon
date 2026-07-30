import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  CalendarDays,
  Gift,
  Link2,
  NotebookPen,
  Package,
  PhoneCall,
  UserRoundX,
  Users,
  Wallet,
} from 'lucide-react'
import { KairoonLogotype } from '../../brand/Logo'
import { SlideShell } from '../SlideShell'

export function IntroSlide() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-center sm:px-8">
      <KairoonLogotype className="h-12 w-auto text-primary sm:h-16" aria-label="Kairoon" />
      <h1 className="text-balance font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl lg:text-5xl">
        Sua agenda no <span className="text-primary">piloto automático</span>
      </h1>
      <p className="max-w-lg text-balance text-sm text-ink-secondary sm:text-base">
        Cinco minutos para ver como o Kairoon organiza os agendamentos, os clientes, o caixa e o
        estoque do seu negócio. Sem instalar nada para assistir.
      </p>
      <p className="text-xs font-medium text-ink-tertiary sm:text-[13px]">
        Use as setas para avançar
      </p>
    </section>
  )
}

const PAINS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: PhoneCall,
    title: 'Você atende e agenda ao mesmo tempo',
    text: 'Cada mensagem no meio do corte é uma interrupção. E quem não é respondido rápido procura outro lugar.',
  },
  {
    icon: NotebookPen,
    title: 'A agenda mora num caderno',
    text: 'Horário marcado duas vezes, rasura e nenhuma ideia de quanto o mês rendeu de verdade.',
  },
  {
    icon: UserRoundX,
    title: 'O cliente esquece e não avisa',
    text: 'A cadeira fica vazia numa hora que estava vendida. Esse buraco não volta mais.',
  },
]

export function PainSlide() {
  return (
    <SlideShell
      eyebrow="O dia a dia hoje"
      title="O problema não é falta de cliente. É o tempo que some no meio do caminho."
      description="Três coisas atrapalham quase todo estabelecimento que atende com hora marcada."
    >
      <ul className="grid w-full gap-3 sm:grid-cols-3">
        {PAINS.map((pain) => (
          <li
            key={pain.title}
            className="flex flex-col items-center gap-2 rounded-xl bg-surface p-5 text-center shadow-card"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-error-light text-error-dark">
              <pain.icon className="h-5 w-5" />
            </span>
            <h3 className="font-display text-[15px] font-semibold text-ink">{pain.title}</h3>
            <p className="text-[13px] leading-relaxed text-ink-secondary">{pain.text}</p>
          </li>
        ))}
      </ul>
    </SlideShell>
  )
}

const MODULES: { icon: LucideIcon; label: string }[] = [
  { icon: CalendarDays, label: 'Agenda' },
  { icon: Link2, label: 'Link de agendamento' },
  { icon: Users, label: 'Clientes' },
  { icon: Wallet, label: 'Financeiro' },
  { icon: Package, label: 'Estoque' },
  { icon: Gift, label: 'Fidelidade' },
  { icon: BarChart3, label: 'Relatórios' },
]

export function ProductSlide() {
  return (
    <SlideShell
      eyebrow="A solução"
      title="Um sistema só, do agendamento ao fechamento do mês"
      description="Nada de um app para agenda, uma planilha para o caixa e um caderno para o estoque. Tudo conversa entre si e funciona no celular, no tablet e no computador."
    >
      <ul className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        {MODULES.map((item) => (
          <li
            key={item.label}
            className="flex flex-col items-center gap-2 rounded-xl bg-surface px-3 py-4 shadow-card"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary-light text-primary">
              <item.icon className="h-5 w-5" />
            </span>
            <span className="text-[13px] font-medium text-ink-secondary">{item.label}</span>
          </li>
        ))}
      </ul>
    </SlideShell>
  )
}
