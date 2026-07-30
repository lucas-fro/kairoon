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

/**
 * Texto de um lado, link público do outro. A coluna do link não tem respiro
 * vertical de propósito: ela encosta no topo e no rodapé do slide, como uma
 * tela de verdade aberta ao lado da explicação.
 */
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
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
      <div className="flex shrink-0 flex-col items-center justify-center gap-3 px-5 pb-4 pt-6 text-center sm:px-8 lg:flex-1 lg:items-start lg:py-10 lg:pr-10 lg:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary">
          {eyebrow}
        </p>
        <h2 className="text-balance font-display text-2xl font-semibold leading-tight text-ink sm:text-3xl lg:text-4xl">
          {title}
        </h2>
        <p className="max-w-md text-balance text-sm text-ink-secondary sm:text-base">
          {description}
        </p>
        {aside}
        {action}
        {hint && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-ink-tertiary sm:text-[13px]">
            {hint}
          </p>
        )}
      </div>

      <div className="flex min-h-[17rem] w-full flex-1 justify-center lg:w-[23rem] lg:flex-none">
        {mock}
      </div>
    </section>
  )
}

const MOCK_CLASS = 'h-full w-full max-w-md border-x border-line shadow-elevated'

export function PublicLinkSlide({ onDone }: { onDone: () => void }) {
  const [touched, setTouched] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <MockSlideLayout
      eyebrow="Do lado do seu cliente"
      title="Seu cliente agenda sozinho, sem te interromper"
      description="Um link só seu, que você manda no Instagram ou no WhatsApp. O cliente escolhe serviço, profissional, dia e horário entre os que estão realmente livres. Chega pronto na sua agenda, de madrugada ou no domingo."
      aside={
        <p className="text-xs text-ink-tertiary">
          Exemplo ilustrativo, com o nome e os serviços de uma barbearia fictícia.
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
      hint={
        done ? undefined : touched ? (
          <>Siga até o fim: o agendamento é o mesmo que o seu cliente faria</>
        ) : (
          <>
            <MousePointerClick className="h-4 w-4" />
            Faça um agendamento aqui do lado
          </>
        )
      }
      mock={
        <BookingMock
          palette={DEFAULT_PALETTE}
          onInteract={() => setTouched(true)}
          onComplete={() => setDone(true)}
          className={MOCK_CLASS}
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
      title="A página é sua, não da Kairoon"
      description={`Seu logo, sua foto de capa e a cor da sua marca: ${PALETTES.length} paletas prontas ou o tom exato que você usa. Quem abre o link vê o seu negócio, não o nosso.`}
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
                  palette.key === option.key &&
                    'ring-2 ring-ink ring-offset-2 ring-offset-background',
                )}
                style={{ backgroundColor: option.primary }}
              />
            </li>
          ))}
        </ul>
      }
      hint={
        touched ? (
          <>O painel que você usa por dentro muda junto</>
        ) : (
          <>
            <Hand className="h-4 w-4" />
            Toque em uma cor
          </>
        )
      }
      mock={<BookingMock palette={palette} className={MOCK_CLASS} />}
    />
  )
}
