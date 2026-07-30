import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { KairoonMark } from '../../brand/Logo'

const PROMISES = [
  'Teste completo por 14 dias, sem pedir cartão de crédito',
  'Seu link de agendamento no ar hoje mesmo',
  'Sem fidelidade e sem multa: cancele quando quiser',
  'Seus dados são seus, e saem com você se quiser sair',
]

export function CtaSlide() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-5 py-8 text-center sm:px-8">
      <KairoonMark className="h-10 w-auto text-primary" aria-label="Kairoon" />

      <h2 className="text-balance font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl lg:text-4xl">
        Comece hoje, <span className="text-primary">grátis por 14 dias</span>
      </h2>
      <p className="max-w-lg text-balance text-sm text-ink-secondary sm:text-base">
        Cadastre seus serviços, compartilhe o link e receba o primeiro agendamento ainda esta
        semana. Se não fizer sentido, é só parar.
      </p>

      <ul className="flex flex-col items-start gap-2">
        {PROMISES.map((promise) => (
          <li key={promise} className="flex items-start gap-2 text-left text-sm text-ink-secondary">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-dark" />
            {promise}
          </li>
        ))}
      </ul>

      <Link
        to="/register"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-[15px] font-medium text-white shadow-soft transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50"
      >
        Criar minha conta grátis
        <ArrowRight className="h-4 w-4" />
      </Link>

      <p className="text-xs text-ink-tertiary">kairoon.com.br</p>
    </section>
  )
}
