import type { CSSProperties, ReactNode } from 'react'
import { minutesToTime, timeToMinutes } from '../../lib/dates'
import { cn } from '../../lib/format'
import type { Appointment, AppointmentStatus } from '../../types/api'
import { SLOT_MINUTES } from './timeOptions'

/** 15min = 24px → hora = 96px (grade mais alta, granularidade de 15min) */
const SLOT_HEIGHT_PX = 24
const PX_PER_MINUTE = SLOT_HEIGHT_PX / SLOT_MINUTES

// Fundos "vivos" (~nível 200 do Tailwind) em valor direto. O dev server não
// recarrega tokens novos do config via HMR, então o hex aqui garante que a cor
// aplique na hora; o texto usa a variante -dark do design system (contraste ok).
const statusClasses: Record<AppointmentStatus, string> = {
  confirmed: 'bg-[#BBF7D0] text-success-dark hover:shadow-soft',
  completed: 'bg-[#BAE6FD] text-info-dark hover:shadow-soft',
  pending: 'bg-[#FDE68A] text-warning-dark hover:shadow-soft',
  // Cancelado opaco: o "apagado" vem do tachado + texto fraco (não de opacidade
  // no card, que deixaria o vizinho vazar no overlap). Texto volta ao cheio no hover.
  cancelled: 'bg-[#FECACA] text-error-dark/70 line-through hover:text-error-dark hover:shadow-soft',
}

/** Padrão sutil (hachura) para colunas fechadas, só com tokens */
const CLOSED_PATTERN_CLASS =
  'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,theme(colors.line.divider)_6px,theme(colors.line.divider)_7px)]'

interface LanePosition {
  lane: number
  lanes: number
}

/**
 * Distribui agendamentos que se sobrepõem em "faixas" lado a lado dentro da
 * coluna, para nenhum bloco cobrir outro por completo.
 */
function computeLanes(dayAppointments: Appointment[]): Map<string, LanePosition> {
  const result = new Map<string, LanePosition>()
  const sorted = [...dayAppointments].sort((a, b) => {
    const startDiff = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    if (startDiff !== 0) return startDiff
    return timeToMinutes(b.endTime) - timeToMinutes(a.endTime)
  })

  let cluster: Appointment[] = []
  let clusterEnd = -1

  const flushCluster = () => {
    if (cluster.length === 0) return
    const laneEnds: number[] = []
    const laneByAppointment = new Map<string, number>()
    for (const appointment of cluster) {
      const start = timeToMinutes(appointment.startTime)
      const end = timeToMinutes(appointment.endTime)
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(end)
      } else {
        laneEnds[lane] = end
      }
      laneByAppointment.set(appointment.id, lane)
    }
    for (const appointment of cluster) {
      result.set(appointment.id, {
        lane: laneByAppointment.get(appointment.id) ?? 0,
        lanes: laneEnds.length,
      })
    }
    cluster = []
  }

  for (const appointment of sorted) {
    if (cluster.length > 0 && timeToMinutes(appointment.startTime) >= clusterEnd) {
      flushCluster()
    }
    cluster.push(appointment)
    clusterEnd = Math.max(clusterEnd, timeToMinutes(appointment.endTime))
  }
  flushCluster()

  return result
}

/** Uma coluna da grade: um dia (visão semana) ou um profissional (visão dia). */
export interface GridColumn {
  key: string
  /** Conteúdo do cabeçalho da coluna (dia+número, ou avatar+nome) */
  header: ReactNode
  appointments: Appointment[]
  isClosed: boolean
  /** Se é o dia de hoje: desenha a linha do horário atual nesta coluna */
  isToday: boolean
  /** Rótulo usado no aria-label dos slots clicáveis */
  slotLabel: string
  onSlotClick: (startTime: string) => void
}

interface WeekGridProps {
  columns: GridColumn[]
  startMinutes: number
  endMinutes: number
  /** Mostra o nome do profissional no bloco (visão semana, filtro "Todos") */
  showEmployee: boolean
  /** Minuto atual do dia para a linha do tempo (null = não exibir) */
  nowMinutes: number | null
  onAppointmentClick: (appointment: Appointment) => void
}

export function WeekGrid({
  columns,
  startMinutes,
  endMinutes,
  showEmployee,
  nowMinutes,
  onAppointmentClick,
}: WeekGridProps) {
  const slotCount = Math.max(1, Math.ceil((endMinutes - startMinutes) / SLOT_MINUTES))
  const totalHeight = slotCount * SLOT_HEIGHT_PX

  // Marcas de hora + o horário de fechamento no fim da grade
  const hourMarks: number[] = []
  for (let minutes = Math.ceil(startMinutes / 60) * 60; minutes <= endMinutes; minutes += 60) {
    hourMarks.push(minutes)
  }
  const labelMarks = hourMarks.includes(endMinutes) ? hourMarks : [...hourMarks, endMinutes]

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl bg-surface shadow-card">
      <div className="thin-scrollbar min-h-[20rem] flex-1 overflow-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `3.5rem repeat(${columns.length}, minmax(0, 1fr))`,
            minWidth: columns.length >= 4 ? 900 : undefined,
          }}
        >
          {/* Canto superior esquerdo */}
          <div className="sticky left-0 top-0 z-30 border-b border-line-divider bg-surface" />

          {/* Cabeçalhos das colunas */}
          {columns.map((column) => (
            <div
              key={column.key}
              className="sticky top-0 z-20 border-b border-l border-line-divider bg-surface px-2 py-2 text-center"
            >
              {column.header}
            </div>
          ))}

          {/* Coluna de horários (fixa à esquerda) */}
          <div
            className="sticky left-0 z-10 border-b border-r border-line-divider bg-surface"
            style={{ height: totalHeight }}
          >
            <div className="relative h-full">
              {labelMarks.map((minutes) => (
                <span
                  key={minutes}
                  className={cn(
                    'absolute right-2 text-xs font-medium text-ink-tertiary',
                    minutes === endMinutes
                      ? '-translate-y-full'
                      : minutes > startMinutes && '-translate-y-1/2',
                  )}
                  style={{ top: (minutes - startMinutes) * PX_PER_MINUTE }}
                >
                  {minutesToTime(minutes)}
                </span>
              ))}
            </div>
          </div>

          {/* Colunas */}
          {columns.map((column) => {
            const lanes = computeLanes(column.appointments)

            return (
              <div
                key={column.key}
                className={cn(
                  'relative border-b border-l border-line-divider',
                  column.isClosed && cn('bg-background', CLOSED_PATTERN_CLASS),
                )}
                style={{ height: totalHeight }}
              >
                {/* Slots clicáveis de 15min */}
                {Array.from({ length: slotCount }, (_, index) => {
                  const minutes = startMinutes + index * SLOT_MINUTES
                  const time = minutesToTime(minutes)
                  return (
                    <button
                      key={minutes}
                      type="button"
                      disabled={column.isClosed}
                      onClick={() => column.onSlotClick(time)}
                      aria-label={
                        column.isClosed
                          ? `Indisponível: ${column.slotLabel}`
                          : `Novo agendamento: ${column.slotLabel} às ${time}`
                      }
                      className={cn(
                        'absolute inset-x-0 border-t transition-colors duration-150',
                        minutes % 60 === 0
                          ? 'border-dashed border-line-divider'
                          : 'border-transparent',
                        index === 0 && 'border-transparent',
                        column.isClosed ? 'cursor-default' : 'hover:bg-secondary-light/50',
                      )}
                      style={{ top: index * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                    />
                  )
                })}

                {/* Blocos de agendamento */}
                {column.appointments.map((appointment) => {
                  const rawStart = timeToMinutes(appointment.startTime)
                  const rawEnd = timeToMinutes(appointment.endTime)
                  const start = Math.max(rawStart, startMinutes)
                  const end = Math.min(Math.max(rawEnd, start + 15), endMinutes)
                  if (end <= start) return null

                  const position = lanes.get(appointment.id) ?? { lane: 0, lanes: 1 }
                  const widthPercent = 100 / position.lanes
                  const blockHeight = (end - start) * PX_PER_MINUTE - 2
                  // Blocos curtos (ex.: 15min) não comportam as linhas de serviço
                  // e profissional; nesse caso mostramos só horário+nome centralizado
                  // e revelamos o restante no hover, quando o bloco cresce.
                  const isShort = blockHeight < 44
                  // Ao passar o mouse, blocos curtos crescem para baixo até
                  // caber todo o conteúdo (sem afetar blocos já altos).
                  const expandedHeight = Math.max(blockHeight, showEmployee ? 60 : 46)
                  const blockStyle = {
                    top: (start - startMinutes) * PX_PER_MINUTE + 1,
                    left: `calc(${position.lane * widthPercent}% + 2px)`,
                    width: `calc(${widthPercent}% - 4px)`,
                    '--block-h': `${blockHeight}px`,
                    '--block-hh': `${expandedHeight}px`,
                  } as CSSProperties

                  return (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => onAppointmentClick(appointment)}
                      title={`${appointment.startTime} · ${appointment.client.name} · ${appointment.service.name}${
                        showEmployee ? ` · ${appointment.employee.name}` : ''
                      }`}
                      className={cn(
                        'group absolute z-[1] flex h-[var(--block-h)] flex-col overflow-hidden px-2 text-left leading-tight shadow-card',
                        // Altura/sombra animam em 200ms; o z-index sobe na hora ao
                        // passar o mouse e só volta 200ms depois de sair — assim o
                        // card fica por cima dos vizinhos durante toda a expansão E
                        // o recolhimento, sem "piscar" atrás deles.
                        'ease-out [transition-property:height,box-shadow,z-index] [transition-duration:200ms,200ms,0ms] [transition-delay:0ms,0ms,200ms]',
                        'hover:z-30 hover:h-[var(--block-hh)] hover:shadow-soft hover:[transition-delay:0ms]',
                        isShort ? 'justify-center py-0 hover:justify-start hover:py-0.5' : 'py-0.5',
                        statusClasses[appointment.status],
                      )}
                      style={blockStyle}
                    >
                      <span className="w-full truncate text-xs">
                        <span className="font-semibold">{appointment.startTime}</span>{' '}
                        <span className="font-medium">{appointment.client.name}</span>
                      </span>
                      <span
                        className={cn(
                          'w-full truncate text-[10px] opacity-80',
                          isShort && 'hidden group-hover:block',
                        )}
                      >
                        {appointment.service.name}
                      </span>
                      {showEmployee && (
                        <span
                          className={cn(
                            'w-full truncate text-[10px] opacity-70',
                            isShort && 'hidden group-hover:block',
                          )}
                        >
                          {appointment.employee.name}
                        </span>
                      )}
                    </button>
                  )
                })}

                {/* Linha do horário atual (nas colunas de hoje) */}
                {column.isToday &&
                  nowMinutes !== null &&
                  nowMinutes >= startMinutes &&
                  nowMinutes <= endMinutes && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10"
                      style={{ top: (nowMinutes - startMinutes) * PX_PER_MINUTE }}
                    >
                      <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-error" />
                      <div className="border-t-2 border-error" />
                    </div>
                  )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
