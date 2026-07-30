import { CalendarPlus, ChevronRight, Clock, Package } from 'lucide-react'
import { readableTextColor } from '../../lib/color'
import { cn, formatBRL, formatDuration } from '../../lib/format'
import type { PublicBranding, PublicEstablishment } from '../../types/api'
import type { PublicService } from './types'
import { LocationMap } from './LocationMap'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'

interface SocialLink {
  name: string
  url: string
  icon: string
  label?: string
}

interface WelcomeStepProps {
  establishment: PublicEstablishment['establishment']
  branding: PublicBranding
  services: PublicService[]
  socialLinks: SocialLink[]
  onStart: () => void
  /** Tocar um serviço entra no fluxo já com ele escolhido. */
  onPickService: (service: PublicService) => void
  /**
   * Encolhe o microsite para caber numa moldura de celular (apresentação em
   * `/apresentacao`). Necessário porque as alturas em `dvh`/`vh` medem sempre a
   * viewport real, não o container onde o componente está embutido.
   */
  compact?: boolean
}

// Rótulo do tipo de negócio (eyebrow acima do nome). 'outro'/desconhecido omite.
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  barbearia: 'Barbearia',
  salao: 'Salão de beleza',
  clinica: 'Clínica',
}

/**
 * Primeira tela do link público: um microsite do estabelecimento. Banner full-bleed
 * (40dvh no mobile/tablet, 30vh no desktop) com o logo ampliado transpassando sua
 * borda, nome + mensagem, CTA de agendamento e um cardápio de serviços. Bonito no
 * celular, com cara de site nas telas maiores.
 */
export function WelcomeStep({
  establishment,
  branding,
  services,
  socialLinks,
  onStart,
  onPickService,
  compact = false,
}: WelcomeStepProps) {
  const fg = readableTextColor(branding.brandColor)
  const welcomeMessage =
    establishment.welcomeMessage?.trim() || 'Agende seu horário em poucos cliques'
  const typeLabel = BUSINESS_TYPE_LABELS[establishment.businessType]

  return (
    <div className="flex w-full flex-1 flex-col pb-10">
      {/* HERO full-bleed: cor de marca sólida ou imagem de banner. */}
      <div className="relative w-full">
        <div
          className={cn(
            'relative w-full overflow-hidden',
            compact
              ? 'h-28'
              : 'h-[40dvh] max-h-[460px] min-h-[16rem] lg:h-[30vh] lg:max-h-[400px] lg:min-h-[14rem]',
          )}
          style={{ backgroundColor: branding.brandColor }}
        >
          {branding.bannerImageUrl && (
            <>
              <img src={branding.bannerImageUrl} alt="" className="h-full w-full object-cover" />
              {/* Escurecimento sutil na base: dá profundidade e assenta o logo. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/25 to-transparent" />
            </>
          )}
        </div>

        {/* LOGO ampliado, centralizado, metade sobre o banner e metade abaixo.
            Sem logo: inicial do nome na cor de marca. */}
        <div
          className={cn(
            'absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 overflow-hidden rounded-full border-4 border-surface bg-surface shadow-elevated',
            compact ? 'h-20 w-20' : 'h-28 w-28 lg:h-32 lg:w-32',
          )}
        >
          {establishment.logoUrl ? (
            <img
              src={establishment.logoUrl}
              alt={establishment.name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            // Sem logo do estabelecimento: usa a marca da Kairoon.
            <div className="flex h-full w-full items-center justify-center rounded-full bg-surface">
              <img src="/logo.svg" alt="Kairoon" className="h-12 w-auto lg:h-14" />
            </div>
          )}
        </div>
      </div>

      {/* CONTEÚDO: coluna centralizada e confortável. O padding-top livra a metade
          do logo que se projeta sobre esta seção. */}
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col items-center px-4 text-center',
          compact ? 'pt-12' : 'pt-20 lg:pt-24',
        )}
      >
        {typeLabel && (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-ink-tertiary">
            {typeLabel}
          </p>
        )}
        <h1
          className={cn(
            'mt-1 text-balance break-words font-display font-semibold text-ink',
            compact ? 'text-lg' : 'text-2xl lg:text-3xl',
          )}
        >
          {establishment.name}
        </h1>
        {/* Régua curta na cor de marca: fecha o bloco de identidade. */}
        <span
          className="mt-3 h-0.5 w-10 rounded-full"
          style={{ backgroundColor: branding.brandColor }}
          aria-hidden="true"
        />
        <p
          className={cn(
            'mt-3 max-w-md text-balance break-words text-ink-secondary',
            compact ? 'text-[13px]' : 'text-sm lg:text-base',
          )}
        >
          {welcomeMessage}
        </p>

        <Button
          size={compact ? 'md' : 'lg'}
          leftIcon={<CalendarPlus className="h-5 w-5" />}
          className={cn('w-full max-w-sm shadow-soft', compact ? 'mt-5' : 'mt-7')}
          style={{ backgroundColor: branding.brandColor, color: fg }}
          onClick={onStart}
        >
          Fazer agendamento
        </Button>

        {/* CARDÁPIO DE SERVIÇOS: some por completo sem serviços. Lista editorial
            com divisórias finas (escala bem para menus grandes). Tocar agenda. */}
        {services.length > 0 && (
          <section
            className={cn('w-full max-w-2xl', compact ? 'mt-8' : 'mt-12')}
            aria-labelledby="welcome-services-heading"
          >
            <h2
              id="welcome-services-heading"
              className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary"
            >
              Serviços
            </h2>
            <p className="mt-1 text-center text-sm text-ink-tertiary">
              Toque em um serviço para agendar
            </p>
            <ul className="mt-5 divide-y divide-line-divider border-y border-line-divider text-left">
              {services.map((service) => (
                <li key={service.id}>
                  <button
                    type="button"
                    onClick={() => onPickService(service)}
                    className="group flex w-full items-center justify-between gap-4 py-4 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <h3 className="min-w-0 break-words text-[15px] font-medium text-ink">
                          {service.name}
                        </h3>
                        {service.isPackage && (
                          <Badge tone="brand">
                            <Package className="h-3 w-3" /> Pacote
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-secondary">
                        <Clock className="h-3.5 w-3.5 text-ink-tertiary" />
                        {formatDuration(service.durationMinutes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        {service.originalPriceCents && (
                          <p className="text-xs text-ink-tertiary line-through">
                            {formatBRL(service.originalPriceCents)}
                          </p>
                        )}
                        <span className="font-display font-semibold text-primary">
                          {formatBRL(service.priceCents)}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary transition-transform duration-200 group-hover:translate-x-0.5" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* LOCALIZAÇÃO: mini mapa com o pin no endereço (some sem endereço). */}
        <LocationMap
          name={establishment.name}
          address={establishment.address}
          addressNumber={establishment.addressNumber}
          neighborhood={establishment.neighborhood}
          city={establishment.city}
          state={establishment.state}
          cep={establishment.cep}
        />

        {/* REDES SOCIAIS: só quando habilitadas (Instagram/WhatsApp). */}
        {socialLinks.length > 0 && (
          <div className="mt-12 flex w-full flex-wrap items-center justify-center gap-3 border-t border-line-divider pt-8">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noreferrer"
                title={social.name}
                aria-label={social.label ? `${social.name} ${social.label}` : social.name}
                className={cn(
                  'inline-flex h-11 items-center justify-center rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-secondary hover:bg-surface-hover',
                  social.label ? 'gap-2 px-4' : 'w-11',
                )}
              >
                <img src={social.icon} alt="" className="h-5 w-5" />
                {social.label && (
                  <span className="text-sm font-medium text-ink-secondary">{social.label}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
