import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/format'

/**
 * Rodapé de ações para popups: os botões preenchem toda a largura em partes
 * iguais (1 → w-full, 2 → 50/50, 3 → 1/3 cada, e assim por diante).
 */
export function DialogActions({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const items = Children.toArray(children).filter(Boolean)

  return (
    <div className={cn('mt-2 flex gap-3', className)}>
      {items.map((child) => {
        if (!isValidElement(child)) return child
        const element = child as ReactElement<{ className?: string }>
        return cloneElement(element, {
          className: cn(element.props.className, 'w-full flex-1'),
        })
      })}
    </div>
  )
}
