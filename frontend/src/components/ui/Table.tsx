import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../../lib/format'

/** Tabela clean do design system: header 12/600 sem uppercase, linhas 56px,
 *  hover surface-hover, divisores sutis. Envolva num Card. */

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="thin-scrollbar w-full overflow-x-auto">
      <table className={cn('w-full text-left text-sm', className)} {...props} />
    </div>
  )
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line-divider', className)} {...props} />
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-11 px-6 text-xs font-semibold text-ink-tertiary', className)}
      {...props}
    />
  )
}

interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  clickable?: boolean
  selected?: boolean
}

export function Tr({ className, clickable, selected, ...props }: TrProps) {
  return (
    <tr
      className={cn(
        'border-b border-line-divider transition-colors duration-150 last:border-0',
        clickable && 'cursor-pointer hover:bg-surface-hover',
        selected && 'bg-secondary-light',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-14 px-6 text-ink-secondary', className)} {...props} />
}
