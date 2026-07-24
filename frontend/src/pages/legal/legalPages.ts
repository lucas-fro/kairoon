export type LegalPageKey = 'privacidade' | 'termos' | 'exclusao'

interface LegalPageMeta {
  key: LegalPageKey
  path: string
  label: string
}

/** As três páginas públicas de conteúdo legal, linkadas entre si no rodapé. */
export const LEGAL_PAGES: LegalPageMeta[] = [
  { key: 'privacidade', path: '/politica-de-privacidade', label: 'Política de Privacidade' },
  { key: 'termos', path: '/termos-de-uso', label: 'Termos de Uso' },
  { key: 'exclusao', path: '/exclusao-de-conta', label: 'Exclusão de Conta' },
]
