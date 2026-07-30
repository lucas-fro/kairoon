import { SlideDeck } from '../../components/presentation/SlideDeck'
import type { Slide } from '../../components/presentation/SlideDeck'
import { AgendaSlide } from '../../components/presentation/slides/AgendaSlide'
import { CtaSlide } from '../../components/presentation/slides/CtaSlide'
import { AutomationSlide, ClientSlide } from '../../components/presentation/slides/DataSlides'
import {
  IntroSlide,
  PainSlide,
  ProductSlide,
} from '../../components/presentation/slides/IntroSlides'
import { BrandingSlide, PublicLinkSlide } from '../../components/presentation/slides/LinkSlides'

/**
 * Apresentação pública do Kairoon (`/apresentacao`): peça de vendas genérica,
 * enviada para estabelecimentos em prospecção. Não pede login e não consulta a
 * API. Os dois slides do meio embutem o link público de verdade rodando com
 * dados fictícios, então a demonstração acompanha o produto sozinha.
 */
const SLIDES: Slide[] = [
  { id: 'abertura', render: () => <IntroSlide /> },
  { id: 'dor', render: () => <PainSlide /> },
  { id: 'produto', render: () => <ProductSlide /> },
  { id: 'agenda', render: () => <AgendaSlide /> },
  { id: 'link-publico', render: ({ goNext }) => <PublicLinkSlide onDone={goNext} /> },
  { id: 'personalizacao', render: () => <BrandingSlide /> },
  { id: 'cliente', render: () => <ClientSlide /> },
  { id: 'automacoes', render: () => <AutomationSlide /> },
  { id: 'cta', render: () => <CtaSlide /> },
]

export function PresentationPage() {
  return <SlideDeck slides={SLIDES} />
}
