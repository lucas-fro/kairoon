import type { CSSProperties } from 'react'
import { cn } from '../../../lib/format'
import { SlideShell } from '../SlideShell'

const PROFESSIONALS = ['Carlos', 'Juliana', 'Rafael']
const HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00']

type Status = 'pendente' | 'confirmado' | 'concluido'

const STATUS_STYLE: Record<Status, string> = {
  pendente: 'bg-warning-light text-warning-dark',
  confirmado: 'bg-secondary-light text-primary',
  concluido: 'bg-success-light text-success-dark',
}

const STATUS_LABEL: Record<Status, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
}

/** `column` = profissional (0..2), `row` = hora inicial (0..4), `span` em horas. */
const APPOINTMENTS: {
  column: number
  row: number
  span: number
  client: string
  service: string
  status: Status
}[] = [
  { column: 0, row: 0, span: 1, client: 'Marcos T.', service: 'Corte Masculino', status: 'concluido' },
  { column: 0, row: 2, span: 2, client: 'Diego R.', service: 'Corte + Barba', status: 'confirmado' },
  { column: 1, row: 0, span: 2, client: 'Ana P.', service: 'Luzes', status: 'concluido' },
  { column: 1, row: 3, span: 1, client: 'Bruna L.', service: 'Sobrancelha', status: 'pendente' },
  { column: 2, row: 1, span: 1, client: 'Felipe S.', service: 'Barba Completa', status: 'confirmado' },
  { column: 2, row: 3, span: 2, client: 'João M.', service: 'Platinado', status: 'pendente' },
]

export function AgendaSlide() {
  return (
    <SlideShell
      eyebrow="Dentro do sistema"
      title="O dia inteiro numa tela só"
      description="Cada coluna é um profissional. A cor diz na hora o que está pendente, confirmado e já concluído."
    >
      <div
        data-no-swipe
        className="w-full max-w-3xl overflow-x-auto rounded-xl bg-surface p-4 shadow-elevated thin-scrollbar"
      >
        <div className="min-w-[21rem]">
          <div className="grid grid-cols-[3rem_repeat(3,1fr)] gap-1 pb-2">
            <span />
            {PROFESSIONALS.map((name) => (
              <span key={name} className="truncate text-center text-xs font-semibold text-ink">
                {name}
              </span>
            ))}
          </div>

          <div
            className="grid grid-cols-[3rem_repeat(3,1fr)] gap-1"
            style={{ gridTemplateRows: `repeat(${HOURS.length}, 2.75rem)` }}
          >
            {HOURS.map((hour, row) => (
              <span
                key={hour}
                className="pt-0.5 text-right text-[11px] tabular-nums text-ink-tertiary"
                style={{ gridColumn: 1, gridRow: row + 1 }}
              >
                {hour}
              </span>
            ))}

            {/* Fundo das faixas de horário livre */}
            {HOURS.map((hour, row) =>
              PROFESSIONALS.map((name, column) => (
                <span
                  key={`${hour}-${name}`}
                  className="rounded-lg border border-dashed border-line"
                  style={{ gridColumn: column + 2, gridRow: row + 1 }}
                />
              )),
            )}

            {APPOINTMENTS.map((item) => (
              <div
                key={`${item.column}-${item.row}`}
                className={cn(
                  'flex flex-col justify-center overflow-hidden rounded-lg px-2 py-1 text-left',
                  STATUS_STYLE[item.status],
                )}
                style={
                  {
                    gridColumn: item.column + 2,
                    gridRow: `${item.row + 1} / span ${item.span}`,
                  } as CSSProperties
                }
              >
                <span className="truncate text-[11px] font-semibold leading-tight">
                  {item.client}
                </span>
                <span className="truncate text-[10px] leading-tight opacity-80">
                  {item.service}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {(Object.keys(STATUS_LABEL) as Status[]).map((status) => (
          <li key={status} className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_STYLE[status])} />
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ul>
    </SlideShell>
  )
}
