import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  actions?: ReactNode
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  )
}
