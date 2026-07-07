import { Button } from '../ui/Button'
import { BrandBanner } from './BrandBanner'
import { readableTextColor } from '../../lib/color'
import type { PublicBranding, PublicEstablishment } from '../../types/api'

interface WelcomeStepProps {
  establishment: PublicEstablishment['establishment']
  branding: PublicBranding
  onStart: () => void
}

export function WelcomeStep({ establishment, branding, onStart }: WelcomeStepProps) {
  return (
    <div className="flex flex-1 flex-col pb-6">
      <BrandBanner
        brandColor={branding.brandColor}
        bannerImageUrl={branding.bannerImageUrl}
        logoUrl={establishment.logoUrl}
        name={establishment.name}
        rounded={false}
      />

      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">{establishment.name}</h1>
        <p className="mt-2 max-w-xs text-sm text-ink-secondary">
          {establishment.welcomeMessage ?? 'Agende seu horário em poucos cliques'}
        </p>

        <Button
          size="lg"
          className="mt-8 w-full"
          style={{ backgroundColor: branding.brandColor, color: readableTextColor(branding.brandColor) }}
          onClick={onStart}
        >
          Fazer agendamento
        </Button>
      </div>
    </div>
  )
}
