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
        Uma apresentação rápida do sistema que organiza os agendamentos, os clientes e o caixa do
        seu negócio.
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
    title: 'Telefone sem parar',
    text: 'Ligação e mensagem no meio do atendimento, só para marcar um horário.',
  },
  {
    icon: NotebookPen,
    title: 'Agenda no caderno',
    text: 'Horário marcado duas vezes, rasura, e ninguém sabe quem atende quem.',
  },
  {
    icon: UserRoundX,
    title: 'Cliente que some',
    text: 'Esqueceu e não avisou. A cadeira fica vazia e o dia rende menos.',
  },
]

export function PainSlide() {
  return (
    <SlideShell
      eyebrow="O dia a dia hoje"
      title="Quanto tempo você perde para marcar um horário?"
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
      title="O Kairoon cuida disso por você"
      description="Um sistema só para tudo o que roda em volta do atendimento. Funciona no celular, no tablet e no computador, sem instalar nada."
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
