import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { listAppointments } from '../../api/appointments'
import { listEmployees } from '../../api/employees'
import { getWorkingHours } from '../../api/establishment'
import { listServices } from '../../api/services'
import { AppointmentDetailsDialog } from '../../components/agenda/AppointmentDetailsDialog'
import { AppointmentSearch } from '../../components/agenda/AppointmentSearch'
import { MonthGrid } from '../../components/agenda/MonthGrid'
import { NewAppointmentDialog } from '../../components/agenda/NewAppointmentDialog'
import { WeekGrid } from '../../components/agenda/WeekGrid'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { Select } from '../../components/ui/Select'
import { Skeleton } from '../../components/ui/Skeleton'
import {
  MONTH_LABELS,
  addDays,
  getDayOfWeek,
  getWeekDays,
  startOfWeek,
  timeToMinutes,
  todayStr,
} from '../../lib/dates'
import { cn, formatDateLong } from '../../lib/format'
import type { Appointment } from '../../types/api'

type ViewMode = 'day' | 'week' | 'month'

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
]

const LEGEND = [
  { label: 'Confirmado', dotClass: 'bg-success' },
  { label: 'Pendente', dotClass: 'bg-warning' },
  { label: 'Concluído', dotClass: 'bg-primary' },
  { label: 'Cancelado', dotClass: 'bg-error/60' },
]

function formatDayShort(dateStr: string): string {
  const day = Number(dateStr.slice(8, 10))
  const month = MONTH_LABELS[Number(dateStr.slice(5, 7)) - 1].slice(0, 3).toLowerCase()
  return `${day} ${month}`
}

function addMonths(dateStr: string, delta: number): string {
  const [year, month] = dateStr.split('-').map(Number)
  const total = year * 12 + (month - 1) + delta
  const newYear = Math.floor(total / 12)
  const newMonth = (total % 12) + 1
  return `${newYear}-${String(newMonth).padStart(2, '0')}-01`
}

function GridSkeleton() {
  return (
    <div className="h-full rounded-xl bg-surface p-6 shadow-card">
      <div className="mb-6 grid grid-cols-7 gap-4">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  )
}

export function AgendaPage() {
  const [view, setView] = useState<ViewMode>('week')
  const [refDate, setRefDate] = useState(() => todayStr())
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)
  const [newDialog, setNewDialog] = useState<{ date?: string; time?: string } | null>(null)

  // Minuto atual do dia para a linha do tempo, atualizado de 5 em 5 minutos
  const [nowMin, setNowMin] = useState(() => {
    const now = new Date()
    return now.getHours() * 60 + now.getMinutes()
  })
  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setNowMin(now.getHours() * 60 + now.getMinutes())
    }, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  const range = useMemo(() => {
    if (view === 'day') return { start: refDate, end: refDate, days: [refDate] }
    if (view === 'week') {
      const days = getWeekDays(refDate)
      return { start: days[0], end: days[6], days }
    }
    const monthStart = `${refDate.slice(0, 7)}-01`
    const gridStart = addDays(monthStart, -getDayOfWeek(monthStart))
    return { start: gridStart, end: addDays(gridStart, 41), days: [] as string[] }
  }, [view, refDate])

  const workingHoursQuery = useQuery({ queryKey: ['working-hours'], queryFn: getWorkingHours })
  const employeesQuery = useQuery({ queryKey: ['employees'], queryFn: listEmployees })
  const servicesQuery = useQuery({ queryKey: ['services'], queryFn: listServices })

  const appointmentsQuery = useQuery({
    queryKey: ['appointments', view, range.start, range.end, employeeFilter],
    queryFn: () =>
      listAppointments({
        start: range.start,
        end: range.end,
        employeeId: employeeFilter || undefined,
      }),
    refetchInterval: 15000,
    placeholderData: (prev) => prev,
  })

  const { startMinutes, endMinutes, closedWeekdays } = useMemo(() => {
    const hours = workingHoursQuery.data ?? []
    const openDays = hours.filter((h) => !h.isClosed)
    const start = openDays.length
      ? Math.min(...openDays.map((h) => timeToMinutes(h.opensAt)))
      : timeToMinutes('08:00')
    const end = openDays.length
      ? Math.max(...openDays.map((h) => timeToMinutes(h.closesAt)))
      : timeToMinutes('20:00')
    return {
      startMinutes: start,
      endMinutes: end,
      closedWeekdays: new Set(hours.filter((h) => h.isClosed).map((h) => h.dayOfWeek)),
    }
  }, [workingHoursQuery.data])

  const employees = employeesQuery.data ?? []
  const activeEmployees = employees.filter((e) => e.active)
  const isLoading = workingHoursQuery.isPending || appointmentsQuery.isPending

  function navigate(delta: number) {
    if (view === 'day') setRefDate((d) => addDays(d, delta))
    else if (view === 'week') setRefDate((d) => addDays(d, delta * 7))
    else setRefDate((d) => addMonths(d, delta))
  }

  const periodLabel =
    view === 'day'
      ? formatDateLong(refDate)
      : view === 'week'
        ? `${formatDayShort(range.start)} – ${formatDayShort(range.end)}`
        : `${MONTH_LABELS[Number(refDate.slice(5, 7)) - 1]} de ${refDate.slice(0, 4)}`

  return (
    <div className={cn('flex flex-col', view !== 'month' && 'lg:h-[calc(100vh-4rem)]')}>
      <PageHeader
        title="Agenda"
        description="Veja por dia, semana ou mês. Clique em um horário para agendar."
        actions={
          <>
            <AppointmentSearch
              onSelect={(appointment) => {
                setRefDate(appointment.date)
                setView('week')
                setSelectedAppointment(appointment)
              }}
            />
            <Button leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => setNewDialog({})}>
              Novo agendamento
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center">
          <Button
            variant="outline"
            size="sm"
            className="rounded-r-none"
            onClick={() => navigate(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefDate(todayStr())}
            className="-ml-px rounded-none"
          >
            Hoje
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="-ml-px rounded-l-none"
            onClick={() => navigate(1)}
            aria-label="Próximo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="font-display text-sm font-semibold capitalize text-ink">{periodLabel}</span>

        {/* Alternância de visualização */}
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setView(option.key)}
              className={cn(
                'h-8 px-3 text-[13px] font-medium transition-colors duration-150',
                view === option.key
                  ? 'bg-primary text-white'
                  : 'bg-surface text-ink-secondary hover:bg-surface-hover',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-4">
          {view !== 'month' && (
            <div className="hidden items-center gap-4 sm:flex">
              {LEGEND.map((item) => (
                <span
                  key={item.label}
                  className="flex items-center gap-1.5 text-xs text-ink-tertiary"
                >
                  <span className={cn('h-2 w-2 rounded-full', item.dotClass)} />
                  {item.label}
                </span>
              ))}
            </div>
          )}

          {activeEmployees.length > 1 && (
            <div className="w-48">
              <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                <option value="">Todos os profissionais</option>
                {activeEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {isLoading ? (
          <GridSkeleton />
        ) : appointmentsQuery.isError ? (
          <div className="rounded-xl bg-error-light/60 p-6 text-center text-sm text-error-dark shadow-card">
            Não foi possível carregar a agenda.{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-2 hover:text-error"
              onClick={() => appointmentsQuery.refetch()}
            >
              Tentar novamente
            </button>
          </div>
        ) : view === 'month' ? (
          <MonthGrid
            monthRef={refDate}
            appointments={appointmentsQuery.data ?? []}
            onSelectDay={(date) => {
              setRefDate(date)
              setView('week')
            }}
          />
        ) : (
          <WeekGrid
            weekDays={range.days}
            appointments={appointmentsQuery.data ?? []}
            closedWeekdays={closedWeekdays}
            startMinutes={startMinutes}
            endMinutes={endMinutes}
            showEmployee={activeEmployees.length > 1 && !employeeFilter}
            nowMinutes={nowMin}
            onSlotClick={(date, time) => setNewDialog({ date, time })}
            onAppointmentClick={setSelectedAppointment}
          />
        )}
      </div>

      <NewAppointmentDialog
        open={newDialog !== null}
        onClose={() => setNewDialog(null)}
        services={servicesQuery.data ?? []}
        employees={employees}
        startMinutes={startMinutes}
        endMinutes={endMinutes}
        defaultDate={newDialog?.date}
        defaultTime={newDialog?.time}
      />

      <AppointmentDetailsDialog
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        startMinutes={startMinutes}
        endMinutes={endMinutes}
      />
    </div>
  )
}
