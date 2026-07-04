import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import {
  WEEKDAY_LABELS_SHORT,
  getDayOfWeek,
  minutesToTime,
  timeToMinutes,
  todayStr,
} from '../../lib/dates'
import { cn, formatDate } from '../../lib/format'
import type { Appointment, AppointmentStatus } from '../../types/api'
import { SLOT_MINUTES } from './timeOptions'

/** 15min = 24px → hora = 96px (grade mais alta, granularidade de 15min) */
const SLOT_HEIGHT_PX = 24
const PX_PER_MINUTE = SLOT_HEIGHT_PX / SLOT_MINUTES

const statusClasses: Record<AppointmentStatus, string> = {
  confirmed: 'bg-success-light text-success-dark hover:shadow-soft',
  completed: 'bg-primary/10 text-primary hover:shadow-soft',
  pending: 'bg-warning-light text-warning-dark hover:shadow-soft',
  cancelled: 'bg-error-light/60 text-error-dark line-through opacity-70 hover:opacity-90',
}

/** Padrão sutil (hachura) para colunas de dias fechados, só com tokens */
const CLOSED_PATTERN_CLASS =
  'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,theme(colors.line.divider)_6px,theme(colors.line.divider)_7px)]'

interface LanePosition {
  lane: number
  lanes: number
}

/**
 * Distribui agendamentos que se sobrepõem em "faixas" lado a lado dentro da
 * coluna do dia, para nenhum bloco cobrir outro por completo.
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

interface WeekGridProps {
  /** Dias exibidos (1 = visão dia, 7 = visão semana), strings 'YYYY-MM-DD' */
  weekDays: string[]
  appointments: Appointment[]
  /** Dias da semana fechados (0=domingo … 6=sábado) */
  closedWeekdays: Set<number>
  startMinutes: number
  endMinutes: number
  /** Mostra o nome do profissional no bloco (filtro "Todos" com >1 funcionário) */
  showEmployee: boolean
  /** Minuto atual do dia para a linha do tempo (null = não exibir) */
  nowMinutes: number | null
  onSlotClick: (date: string, startTime: string) => void
  onAppointmentClick: (appointment: Appointment) => void
}

export function WeekGrid({
  weekDays,
  appointments,
  closedWeekdays,
  startMinutes,
  endMinutes,
  showEmployee,
  nowMinutes,
  onSlotClick,
  onAppointmentClick,
}: WeekGridProps) {
  const today = todayStr()
  const slotCount = Math.max(1, Math.ceil((endMinutes - startMinutes) / SLOT_MINUTES))
  const totalHeight = slotCount * SLOT_HEIGHT_PX

  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>()
    for (const appointment of appointments) {
      const list = map.get(appointment.date)
      if (list) list.push(appointment)
      else map.set(appointment.date, [appointment])
    }
    return map
  }, [appointments])

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
            gridTemplateColumns: `3.5rem repeat(${weekDays.length}, minmax(0, 1fr))`,
            minWidth: weekDays.length >= 4 ? 900 : undefined,
          }}
        >
          {/* Canto superior esquerdo */}
          <div className="sticky left-0 top-0 z-30 border-b border-line-divider bg-surface" />

          {/* Cabeçalhos dos dias */}
          {weekDays.map((date) => {
            const isToday = date === today
            return (
              <div
                key={date}
                className="sticky top-0 z-20 border-b border-l border-line-divider bg-surface px-2 py-2 text-center"
              >
                <p className="text-[11px] font-medium text-ink-tertiary">
                  {WEEKDAY_LABELS_SHORT[getDayOfWeek(date)]}
                </p>
                <span
                  className={cn(
                    'mx-auto mt-1 flex h-6 items-center justify-center text-sm font-semibold',
                    isToday ? 'w-6 rounded-full bg-primary text-white' : 'text-ink',
                  )}
                >
                  {Number(date.slice(8, 10))}
                </span>
              </div>
            )
          })}

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

          {/* Colunas dos dias */}
          {weekDays.map((date) => {
            const isClosed = closedWeekdays.has(getDayOfWeek(date))
            const dayAppointments = appointmentsByDay.get(date) ?? []
            const lanes = computeLanes(dayAppointments)

            return (
              <div
                key={date}
                className={cn(
                  'relative border-b border-l border-line-divider',
                  isClosed && cn('bg-background', CLOSED_PATTERN_CLASS),
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
                      disabled={isClosed}
                      onClick={() => onSlotClick(date, time)}
                      aria-label={
                        isClosed
                          ? `Fechado em ${formatDate(date)}`
                          : `Novo agendamento em ${formatDate(date)} às ${time}`
                      }
                      className={cn(
                        'absolute inset-x-0 border-t transition-colors duration-150',
                        minutes % 60 === 0
                          ? 'border-dashed border-line-divider'
                          : 'border-transparent',
                        index === 0 && 'border-transparent',
                        isClosed ? 'cursor-default' : 'hover:bg-secondary-light/50',
                      )}
                      style={{ top: index * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                    />
                  )
                })}

                {/* Blocos de agendamento */}
                {dayAppointments.map((appointment) => {
                  const rawStart = timeToMinutes(appointment.startTime)
                  const rawEnd = timeToMinutes(appointment.endTime)
                  const start = Math.max(rawStart, startMinutes)
                  const end = Math.min(Math.max(rawEnd, start + 15), endMinutes)
                  if (end <= start) return null

                  const position = lanes.get(appointment.id) ?? { lane: 0, lanes: 1 }
                  const widthPercent = 100 / position.lanes
                  const blockHeight = (end - start) * PX_PER_MINUTE - 2
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
                      title={`${appointment.startTime} · ${appointment.client.name} · ${appointment.service.name}`}
                      className={cn(
                        'absolute z-[1] flex h-[var(--block-h)] flex-col overflow-hidden px-2 py-1 text-left leading-tight shadow-card',
                        'transition-all duration-200 ease-out hover:z-30 hover:h-[var(--block-hh)] hover:shadow-soft',
                        statusClasses[appointment.status],
                      )}
                      style={blockStyle}
                    >
                      <span className="w-full truncate text-xs">
                        <span className="font-semibold">{appointment.startTime}</span>{' '}
                        <span className="font-medium">{appointment.client.name}</span>
                      </span>
                      <span className="w-full truncate text-[11px] opacity-80">
                        {appointment.service.name}
                        {showEmployee && ` · ${appointment.employee.name}`}
                      </span>
                    </button>
                  )
                })}

                {/* Linha do horário atual (somente na coluna de hoje) */}
                {date === today &&
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
