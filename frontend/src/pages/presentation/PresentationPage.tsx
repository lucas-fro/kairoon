import { SlideDeck } from '../../components/presentation/SlideDeck'
import type { Slide } from '../../components/presentation/SlideDeck'
import { AgendaSlide } from '../../components/presentation/slides/AgendaSlide'
import { CrmSlide } from '../../components/presentation/slides/CrmSlide'
import { CtaSlide } from '../../components/presentation/slides/CtaSlide'
import { FinanceSlide } from '../../components/presentation/slides/FinanceSlide'
import {
  IntroSlide,
  PainSlide,
  ProductSlide,
} from '../../components/presentation/slides/IntroSlides'
import { BrandingSlide, PublicLinkSlide } from '../../components/presentation/slides/LinkSlides'
import { NotificationsSlide } from '../../components/presentation/slides/NotificationsSlide'
import { ReportsSlide } from '../../components/presentation/slides/ReportsSlide'
import { StockSlide } from '../../components/presentation/slides/StockSlide'

/**
 * Apresentação pública do Kairoon (`/apresentacao`): peça de vendas genérica,
 * enviada para estabelecimentos em prospecção. Não pede login e não consulta a
 * API. Os dois slides do link público embutem o fluxo de agendamento de
 * verdade, com dados fictícios, então a demonstração acompanha o produto
 * sozinha em vez de virar uma captura de tela que envelhece.
 */
const SLIDES: Slide[] = [
  { id: 'abertura', render: () => <IntroSlide /> },
  { id: 'dor', render: () => <PainSlide /> },
  { id: 'produto', render: () => <ProductSlide /> },
  { id: 'agenda', render: () => <AgendaSlide /> },
  { id: 'link-publico', render: ({ goNext }) => <PublicLinkSlide onDone={goNext} /> },
  { id: 'personalizacao', render: () => <BrandingSlide /> },
  { id: 'notificacoes', render: () => <NotificationsSlide /> },
  { id: 'clientes', render: () => <CrmSlide /> },
  { id: 'financeiro', render: () => <FinanceSlide /> },
  { id: 'estoque', render: () => <StockSlide /> },
  { id: 'relatorios', render: () => <ReportsSlide /> },
  { id: 'cta', render: () => <CtaSlide /> },
]

export function PresentationPage() {
  return <SlideDeck slides={SLIDES} />
}
