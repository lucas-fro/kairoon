import { useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, Hand, MousePointerClick } from 'lucide-react'
import { cn } from '../../../lib/format'
import type { Palette } from '../../../lib/palettes'
import { DEFAULT_PALETTE, PALETTE_MAP, PALETTES } from '../../../lib/palettes'
import { Button } from '../../ui/Button'
import { BookingMock } from '../BookingMock'

/** Amostra das paletas prontas (a lista completa fica nas configurações). */
const SHOWCASE_KEYS = [
  'padrao',
  'esmeralda',
  'vermelho',
  'violeta',
  'laranja',
  'turquesa',
  'rosa',
  'grafite',
]
const SHOWCASE = SHOWCASE_KEYS.map((key) => PALETTE_MAP[key]).filter(Boolean)

interface SlideLayoutProps {
  eyebrow: string
  title: ReactNode
  description: string
  hint?: ReactNode
  aside?: ReactNode
  action?: ReactNode
  mock: ReactNode
}

/** Texto de um lado, celular do outro (empilhado no mobile). */
function MockSlideLayout({
  eyebrow,
  title,
  description,
  hint,
  aside,
  action,
  mock,
}: SlideLayoutProps) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-5 px-5 py-6 sm:px-8 lg:flex-row lg:gap-12 lg:py-8">
      <div className="flex max-w-md shrink-0 flex-col items-center gap-3 text-center lg:items-start lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary">
          {eyebrow}
        </p>
        <h2 className="text-balance font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl lg:text-4xl">
          {title}
        </h2>
        <p className="text-balance text-sm text-ink-secondary sm:text-base">{description}</p>
        {aside}
        {action}
        {hint && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-tertiary sm:text-[13px]">
            {hint}
          </p>
        )}
      </div>
      {/* No mobile o aparelho estica no espaço que sobra; no desktop tem altura fixa. */}
      <div className="flex min-h-[19rem] w-full flex-1 items-center justify-center lg:h-[32rem] lg:min-h-0 lg:w-auto lg:flex-none">
        {mock}
      </div>
    </section>
  )
}

interface PublicLinkSlideProps {
  /** Concluir o agendamento fictício também avança a apresentação. */
  onDone: () => void
}

export function PublicLinkSlide({ onDone }: PublicLinkSlideProps) {
  const [touched, setTouched] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <MockSlideLayout
      eyebrow="Do lado do seu cliente"
      title="Um link só seu para o cliente agendar sozinho"
      description="Você manda o link no Instagram ou no WhatsApp. O cliente escolhe o serviço e o horário livre a qualquer hora, sem baixar aplicativo e sem falar com ninguém."
      hint={
        done ? undefined : touched ? (
          <>Agora escolha um horário livre</>
        ) : (
          <>
            <MousePointerClick className="h-4 w-4" />
            Toque em um serviço dentro do celular
          </>
        )
      }
      aside={
        <p className="text-xs text-ink-tertiary">
          Exemplo ilustrativo. O link fica com o nome, o logo e os serviços do seu negócio.
        </p>
      }
      action={
        done && (
          <Button size="sm" onClick={onDone}>
            Continuar
            <ArrowRight className="h-4 w-4" />
          </Button>
        )
      }
      mock={
        <BookingMock
          palette={DEFAULT_PALETTE}
          onInteract={() => setTouched(true)}
          onComplete={() => setDone(true)}
          className="h-full max-h-[32rem]"
        />
      }
    />
  )
}

export function BrandingSlide() {
  const [palette, setPalette] = useState<Palette>(DEFAULT_PALETTE)
  const [touched, setTouched] = useState(false)

  return (
    <MockSlideLayout
      eyebrow="Sua marca"
      title="Com a cara do seu negócio"
      description={`Escolha entre ${PALETTES.length} paletas prontas ou use a cor exata da sua marca. Suba seu logo e sua foto de capa: o link inteiro muda junto.`}
      hint={touched ? <>O painel do sistema muda junto com o link</> : (
        <>
          <Hand className="h-4 w-4" />
          Toque em uma cor
        </>
      )}
      aside={
        <ul className="flex flex-wrap justify-center gap-2 lg:justify-start">
          {SHOWCASE.map((option) => (
            <li key={option.key}>
              <button
                type="button"
                onClick={() => {
                  setPalette(option)
                  setTouched(true)
                }}
                aria-label={`Usar a paleta ${option.label}`}
                aria-pressed={palette.key === option.key}
                className={cn(
                  'h-8 w-8 rounded-full transition-transform duration-150 hover:scale-110',
                  palette.key === option.key && 'ring-2 ring-ink ring-offset-2 ring-offset-background',
                )}
                style={{ backgroundColor: option.primary }}
              />
            </li>
          ))}
        </ul>
      }
      mock={
        <BookingMock palette={palette} className="h-[26rem] shrink-0 sm:h-[30rem]" />
      }
    />
  )
}
