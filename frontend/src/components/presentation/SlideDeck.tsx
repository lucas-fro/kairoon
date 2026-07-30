import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { cn } from '../../lib/format'
import { KairoonLogotype } from '../brand/Logo'
import { Button } from '../ui/Button'

export interface SlideContext {
  /** Avança sozinho quando a interação do slide conclui. */
  goNext: () => void
}

export interface Slide {
  id: string
  render: (ctx: SlideContext) => ReactNode
}

interface SlideDeckProps {
  slides: Slide[]
}

/** Distância mínima do arraste para valer como troca de slide. */
const SWIPE_THRESHOLD = 60

/**
 * Navegação da apresentação: setas, bolinhas, teclado e arraste no toque.
 * Os slides são livres para chamar `goNext()` quando a interação deles termina.
 */
export function SlideDeck({ slides }: SlideDeckProps) {
  const [index, setIndex] = useState(0)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  const isFirst = index === 0
  const isLast = index === slides.length - 1

  const goTo = useCallback(
    (target: number) => setIndex(Math.max(0, Math.min(slides.length - 1, target))),
    [slides.length],
  )
  const goNext = useCallback(() => goTo(index + 1), [goTo, index])
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index])

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrev()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [goNext, goPrev])

  function handlePointerDown(event: ReactPointerEvent) {
    // Só toque/caneta: arrastar com o mouse atrapalharia seleção de texto.
    if (event.pointerType === 'mouse') return
    // Áreas que rolam na horizontal ficam de fora: lá o arraste é rolagem.
    if ((event.target as Element).closest('[data-no-swipe]')) return
    dragStart.current = { x: event.clientX, y: event.clientY }
  }

  function handlePointerUp(event: ReactPointerEvent) {
    const start = dragStart.current
    dragStart.current = null
    if (!start) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    // Ignora o que for mais vertical que horizontal: é rolagem, não swipe.
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return
    if (dx < 0) goNext()
    else goPrev()
  }

  const slide = slides[index]

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-3 sm:px-8">
        <KairoonLogotype className="h-6 w-auto text-primary" aria-label="Kairoon" />
        <span className="text-xs font-medium tabular-nums text-ink-tertiary">
          {index + 1} / {slides.length}
        </span>
      </header>

      <main
        key={slide.id}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        className="deck-enter flex min-h-0 w-full flex-1 flex-col overflow-y-auto overscroll-contain"
      >
        {slide.render({ goNext })}
      </main>

      <nav
        aria-label="Navegação da apresentação"
        className="flex shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-4 py-3 sm:px-8"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={goPrev}
          disabled={isFirst}
          aria-label="Slide anterior"
          className="w-10 px-0 sm:w-auto sm:px-3"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Voltar</span>
        </Button>

        <ol className="flex min-w-0 items-center gap-1.5">
          {slides.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Ir para o slide ${i + 1}`}
                aria-current={i === index ? 'step' : undefined}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-200',
                  i === index ? 'w-6 bg-primary' : 'w-1.5 bg-line hover:bg-ink-tertiary',
                )}
              />
            </li>
          ))}
        </ol>

        {isLast ? (
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RotateCcw className="h-4 w-4" />}
            onClick={() => goTo(0)}
            aria-label="Recomeçar a apresentação"
          >
            <span className="hidden sm:inline">Recomeçar</span>
          </Button>
        ) : (
          <Button size="sm" onClick={goNext} aria-label="Próximo slide">
            <span className="hidden sm:inline">Próximo</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </nav>
    </div>
  )
}
