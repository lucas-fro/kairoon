import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Zap } from 'lucide-react'
import { listAppointments } from '../../api/appointments'
import { listEmployees } from '../../api/employees'
import { getWorkingHours } from '../../api/establishment'
import { listServices } from '../../api/services'
import { listWaitlist } from '../../api/waitlist'
import { AppointmentDetailsDialog } from '../../components/agenda/AppointmentDetailsDialog'
import { AppointmentSearch } from '../../components/agenda/AppointmentSearch'
import { MonthGrid } from '../../components/agenda/MonthGrid'
import { NewAppointmentDialog } from '../../components/agenda/NewAppointmentDialog'
import { WaitlistDialog } from '../../components/agenda/WaitlistDialog'
import { WaitlistPromoteDialog } from '../../components/agenda/WaitlistPromoteDialog'
import { WalkInDialog } from '../../components/agenda/WalkInDialog'
import { WeekGrid, type GridColumn } from '../../components/agenda/WeekGrid'
import {
  PendingAppointmentDialog,
  toPendingView,
} from '../../components/realtime/PendingAppointmentDialog'
import type { PendingAppointmentView } from '../../components/realtime/PendingAppointmentDialog'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { SelectMenu } from '../../components/ui/SelectMenu'
import { Skeleton } from '../../components/ui/Skeleton'
import {
  MONTH_LABELS,
  WEEKDAY_LABELS_SHORT,
  addDays,
  getDayOfWeek,
  getWeekDays,
  startOfWeek,
  timeToMinutes,
  todayStr,
} from '../../lib/dates'
import { cn, formatDate, formatDateLong } from '../../lib/format'
import type { Appointment, WaitlistEntry } from '../../types/api'

type ViewMode = 'day' | 'week' | 'month'

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'day', label: 'Dia' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mês' },
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
  const [pendingAppt, setPendingAppt] = useState<PendingAppointmentView | null>(null)
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [waitlistOpen, setWaitlistOpen] = useState(false)
  const [promoteEntry, setPromoteEntry] = useState<WaitlistEntry | null>(null)
  const [newDialog, setNewDialog] = useState<{
    date?: string
    time?: string
    employeeId?: string
  } | null>(null)

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
  const waitlistQuery = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => listWaitlist({ status: 'waiting' }),
  })
  const waitlistCount = waitlistQuery.data?.length ?? 0

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

  // Só para desenhar o grid: +1h além do fechamento, para que agendamentos
  // feitos perto do fechamento (que ultrapassam o horário) continuem visíveis
  // em vez de ficarem recortados/ocultos. Os seletores de horário (novo
  // agendamento, reagendar, fila de espera) continuam limitados a endMinutes.
  const gridEndMinutes = Math.min(endMinutes + 60, 1440)

  const employees = employeesQuery.data ?? []
  const activeEmployees = employees.filter((e) => e.active)
  const isLoading = workingHoursQuery.isPending || appointmentsQuery.isPending

  // Colunas da grade: na visão semana, uma por dia; na visão dia, uma por
  // profissional (com nome + avatar no topo) mostrando o dia selecionado.
  const columns: GridColumn[] = useMemo(() => {
    const appts = appointmentsQuery.data ?? []
    const today = todayStr()
    const active = (employeesQuery.data ?? []).filter((e) => e.active)

    if (view === 'day') {
      const cols = employeeFilter ? active.filter((e) => e.id === employeeFilter) : active
      const weekday = getDayOfWeek(refDate)
      const establishmentClosed = closedWeekdays.has(weekday)
      return cols.map((emp) => ({
        key: emp.id,
        header: (
          <div className="flex flex-col items-center gap-1">
            {emp.photoUrl ? (
              <img
                src={emp.photoUrl}
                alt={emp.name}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {emp.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="w-full truncate text-[11px] font-medium text-ink">{emp.name}</span>
          </div>
        ),
        appointments: appts.filter((a) => a.employee.id === emp.id),
        isClosed: establishmentClosed || !emp.workDays.includes(weekday),
        isToday: refDate === today,
        slotLabel: emp.name,
        onSlotClick: (time: string) => setNewDialog({ date: refDate, time, employeeId: emp.id }),
      }))
    }

    return range.days.map((date) => {
      const isToday = date === today
      return {
        key: date,
        header: (
          <>
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
          </>
        ),
        appointments: appts.filter((a) => a.date === date),
        isClosed: closedWeekdays.has(getDayOfWeek(date)),
        isToday,
        slotLabel: formatDate(date),
        onSlotClick: (time: string) =>
          setNewDialog({ date, time, employeeId: employeeFilter || undefined }),
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, range.days, appointmentsQuery.data, employeesQuery.data, employeeFilter, closedWeekdays, refDate])

  const showEmployeeInBlock = view === 'week' && activeEmployees.length > 1 && !employeeFilter

  function navigate(delta: number) {
    if (view === 'day') setRefDate((d) => addDays(d, delta))
    else if (view === 'week') setRefDate((d) => addDays(d, delta * 7))
    else setRefDate((d) => addMonths(d, delta))
  }

  // Pendente abre o popup de aprovação (aceitar/recusar); os demais, os detalhes.
  function openAppointment(appointment: Appointment) {
    if (appointment.status === 'pending') setPendingAppt(toPendingView(appointment))
    else setSelectedAppointment(appointment)
  }

  const periodLabel =
    view === 'day'
      ? formatDateLong(refDate)
      : view === 'week'
        ? `${formatDayShort(range.start)} – ${formatDayShort(range.end)}`
        : `${MONTH_LABELS[Number(refDate.slice(5, 7)) - 1]} de ${refDate.slice(0, 4)}`

  return (
    <div className={cn('flex flex-col', view !== 'month' && 'lg:h-[calc(100vh-6rem)]')}>
      <PageHeader
        title="Agenda"
        description="Veja por dia, semana ou mês. Clique em um horário para agendar."
        actions={
          <>
            <AppointmentSearch
              onSelect={(appointment) => {
                setRefDate(appointment.date)
                setView('week')
                openAppointment(appointment)
              }}
            />
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Clock className="h-4 w-4 text-primary" />}
              onClick={() => setWaitlistOpen(true)}
            >
              Fila de espera{waitlistCount > 0 ? ` (${waitlistCount})` : ''}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Zap className="h-4 w-4 text-primary" />}
              onClick={() => setWalkInOpen(true)}
            >
              Atender agora
            </Button>
            <Button
              size="sm"
              leftIcon={<CalendarPlus className="h-4 w-4" />}
              onClick={() => setNewDialog({ employeeId: employeeFilter || undefined })}
            >
              Novo agendamento
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center">
          <Button
            variant="outline"
            size="sm"
            className="rounded-r-none"
            onClick={() => navigate(-1)}
            aria-label="Anterior"
          >
            <ChevronLeft className="h-4 w-4 text-primary" />
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
            <ChevronRight className="h-4 w-4 text-primary" />
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
          {activeEmployees.length > 1 && (
            <div className="w-48">
              <SelectMenu
                className="!h-8 text-[13px]"
                value={employeeFilter}
                onChange={setEmployeeFilter}
                options={[
                  { value: '', label: 'Todos os profissionais' },
                  ...activeEmployees.map((employee) => ({
                    value: employee.id,
                    label: employee.name,
                  })),
                ]}
              />
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
            columns={columns}
            startMinutes={startMinutes}
            endMinutes={gridEndMinutes}
            showEmployee={showEmployeeInBlock}
            nowMinutes={nowMin}
            onAppointmentClick={openAppointment}
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
        defaultEmployeeId={newDialog?.employeeId}
      />

      <WalkInDialog
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        services={servicesQuery.data ?? []}
        employees={employees}
        defaultEmployeeId={employeeFilter || undefined}
      />

      <WaitlistDialog
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        services={servicesQuery.data ?? []}
        employees={employees}
        onPromote={(entry) => {
          setWaitlistOpen(false)
          setPromoteEntry(entry)
        }}
      />

      {promoteEntry && (
        <WaitlistPromoteDialog
          entry={promoteEntry}
          onClose={() => setPromoteEntry(null)}
          employees={employees}
          startMinutes={startMinutes}
          endMinutes={endMinutes}
        />
      )}

      <AppointmentDetailsDialog
        appointment={selectedAppointment}
        onClose={() => setSelectedAppointment(null)}
        startMinutes={startMinutes}
        endMinutes={endMinutes}
      />

      {pendingAppt && (
        <PendingAppointmentDialog
          appointment={pendingAppt}
          onClose={() => setPendingAppt(null)}
          onResolved={() => setPendingAppt(null)}
        />
      )}
    </div>
  )
}
