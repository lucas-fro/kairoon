import { Button } from '../ui/Button'
import type { PublicEstablishment } from '../../types/api'

interface WelcomeStepProps {
  establishment: PublicEstablishment['establishment']
  onStart: () => void
}

export function WelcomeStep({ establishment, onStart }: WelcomeStepProps) {
  return (
    <div className="flex flex-1 flex-col px-2 pb-6 pt-10">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {establishment.logoUrl ? (
          <img
            src={establishment.logoUrl}
            alt={establishment.name}
            className="h-24 w-24 rounded-full object-cover shadow-card"
          />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary font-display text-3xl font-semibold text-white shadow-card">
            {establishment.name.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
          {establishment.name}
        </h1>
        <p className="mt-2 max-w-xs text-sm text-ink-secondary">
          {establishment.welcomeMessage ?? 'Agende seu horário em poucos cliques'}
        </p>

        <Button size="lg" className="mt-8 w-full" onClick={onStart}>
          Fazer agendamento
        </Button>
      </div>
    </div>
  )
}
