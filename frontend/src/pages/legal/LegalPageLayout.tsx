import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KairoonLogotype } from '../../components/brand/Logo'
import { LEGAL_PAGES } from './legalPages'
import type { LegalPageKey } from './legalPages'

interface LegalPageLayoutProps {
  current: LegalPageKey
  title: string
  updatedAt: string
  children: ReactNode
}

export function LegalPageLayout({ current, title, updatedAt, children }: LegalPageLayoutProps) {
  const otherPages = LEGAL_PAGES.filter((page) => page.key !== current)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-center justify-center px-4 py-5 sm:px-6">
          <Link to="/" aria-label="Ir para a página inicial">
            <KairoonLogotype className="h-8 w-auto text-primary" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl bg-surface p-6 shadow-card sm:p-10">
          <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-tertiary">Última atualização: {updatedAt}</p>

          <div className="mt-6 space-y-4 text-justify text-sm leading-relaxed text-ink-secondary [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-display [&_h2]:font-semibold [&_h2]:text-ink [&_strong]:text-ink">
            {children}
          </div>

          <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
            {otherPages.map((page) => (
              <a
                key={page.key}
                href={page.path}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary transition-colors duration-150 hover:text-primary-hover hover:underline"
              >
                {page.label}
              </a>
            ))}
          </nav>
        </div>
      </main>
    </div>
  )
}
