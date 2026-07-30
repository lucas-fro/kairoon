import type { PublicBranding, PublicEstablishment } from '../../types/api'
import type { PublicService } from '../booking/types'

/**
 * Dados fictícios do estabelecimento usado como exemplo na apresentação
 * (`/apresentacao`). Nada aqui vem da API: a página é estática e pode ser
 * aberta por qualquer pessoa, sem conta. O conteúdo espelha o seed de
 * demonstração do backend (`backend/src/db/seed-demo.ts`) para o exemplo ter
 * cara de negócio real.
 */

/**
 * Logo do exemplo como data URI: evita mais um asset em `public/` e uma
 * requisição. Monograma dourado sobre grafite, neutro o bastante para conviver
 * com qualquer paleta escolhida no slide de personalização.
 */
const DEMO_LOGO =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' fill='%231C1917'/%3E%3Ctext x='48' y='63' text-anchor='middle' font-family='Georgia,serif' font-size='40' letter-spacing='2' fill='%23D9A441'%3ENO%3C/text%3E%3C/svg%3E"

export const DEMO_ESTABLISHMENT: PublicEstablishment['establishment'] = {
  id: 'demo',
  name: 'Barbearia Navalha de Ouro',
  slug: 'navalha-de-ouro',
  logoUrl: DEMO_LOGO,
  themeColor: '#1E2F5E',
  welcomeMessage: 'Agende seu horário em poucos cliques e venha renovar o visual.',
  businessType: 'barbearia',
  // Sem endereço: o mini mapa do link real é um iframe do Google, que não faz
  // sentido carregar dentro da moldura de celular de uma apresentação.
  address: null,
  addressNumber: null,
  neighborhood: null,
  city: null,
  state: null,
  cep: null,
  socials: null,
  acceptingBookings: true,
}

export const DEMO_SERVICES: PublicService[] = [
  {
    id: 'corte',
    name: 'Corte Masculino',
    durationMinutes: 30,
    priceCents: 4500,
    isPackage: false,
    originalPriceCents: null,
  },
  {
    id: 'barba',
    name: 'Barba Completa',
    durationMinutes: 30,
    priceCents: 3500,
    isPackage: false,
    originalPriceCents: null,
  },
  {
    id: 'cortebarba',
    name: 'Corte + Barba',
    durationMinutes: 60,
    priceCents: 7000,
    isPackage: true,
    originalPriceCents: 8000,
  },
  {
    id: 'pezinho',
    name: 'Pezinho (Acabamento)',
    durationMinutes: 15,
    priceCents: 1500,
    isPackage: false,
    originalPriceCents: null,
  },
  {
    id: 'sobrancelha',
    name: 'Sobrancelha',
    durationMinutes: 15,
    priceCents: 1500,
    isPackage: false,
    originalPriceCents: null,
  },
]

/** Sem marca d'água e sem banner: o herói fica na cor da paleta escolhida. */
export const DEMO_BRANDING: PublicBranding = {
  brandColor: '#1E2F5E',
  palette: null,
  bannerImageUrl: null,
  showKairoonWatermark: false,
  footerMessage: null,
}

export const DEMO_EMPLOYEE_NAME = 'Carlos Andrade'

/** Horários livres do dia no mock (o link real busca isso na API). */
export const DEMO_SLOTS = [
  '09:00',
  '09:30',
  '10:00',
  '11:00',
  '11:30',
  '13:30',
  '14:00',
  '15:00',
  '15:30',
  '16:00',
  '17:00',
  '18:30',
]
