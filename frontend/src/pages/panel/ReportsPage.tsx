import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError } from '../../api/client'
import {
  getAppointmentsByStatusReport,
  getBusyHoursReport,
  getNewClientsReport,
  getOccupancyReport,
  getPaymentMethodsReport,
  getRevenueByEmployeeReport,
  getRevenueReport,
  getTopClientsReport,
  getTopServices,
} from '../../api/reports'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { CHART_COLORS, METHOD_COLORS, STATUS_COLORS } from '../../lib/chartColors'
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SHORT,
  addDays,
  parseDate,
  todayStr,
} from '../../lib/dates'
import { cn, formatBRL, formatDate } from '../../lib/format'
import type {
  AppointmentsByStatusPoint,
  BusyHourCell,
  PaymentMethod,
  TopService,
} from '../../types/api'

type GroupBy = 'day' | 'month'

interface RevenueBarDatum {
  period: string
  incomeCents: number
  expenseCents: number
}

interface OccupancyBarDatum {
  dayOfWeek: number
  label: string
  percent: number
  bookedMinutes: number
  availableMinutes: number
}

/** Item genérico de barra horizontal com valor em reais (métodos, clientes, recursos) */
interface RevenueRow {
  key: string
  label: string
  valueCents: number
}

const PRESETS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
] as const

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
}

const STATUS_META = [
  { key: 'completed', label: 'Concluídos', color: STATUS_COLORS.completed },
  { key: 'confirmed', label: 'Confirmados', color: STATUS_COLORS.confirmed },
  { key: 'pending', label: 'Pendentes', color: STATUS_COLORS.pending },
  { key: 'cancelled', label: 'Cancelados', color: STATUS_COLORS.cancelled },
] as const

/** Estilo padrão dos ticks: texto de eixo sempre em cinza, 12px */
const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: 12 }

function diffInDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)
}

/** Todos os dias 'YYYY-MM-DD' entre from e to (inclusive) */
function buildDaySequence(from: string, to: string): string[] {
  const days: string[] = []
  let cursor = from
  let guard = 0
  while (cursor <= to && guard < 400) {
    days.push(cursor)
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return days
}

/** Todos os meses 'YYYY-MM' entre from e to (inclusive) */
function buildMonthSequence(from: string, to: string): string[] {
  const months: string[] = []
  let year = Number(from.slice(0, 4))
  let month = Number(from.slice(5, 7))
  const endYear = Number(to.slice(0, 4))
  const endMonth = Number(to.slice(5, 7))
  let guard = 0
  while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 240) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    guard += 1
  }
  return months
}

function buildPeriodSequence(from: string, to: string, groupBy: GroupBy): string[] {
  return groupBy === 'month' ? buildMonthSequence(from, to) : buildDaySequence(from, to)
}

/** Tick compacto do eixo Y de dinheiro: R$ 1.200 em vez de R$ 1.200,00 */
function formatCompactBRL(cents: number): string {
  return formatBRL(cents).replace(',00', '')
}

/** Minutos → horas com 1 decimal em pt-BR: 210 → '3,5h' */
function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1).replace('.', ',')}h`
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Erro inesperado ao carregar os dados'
}

/** Tick do eixo X: dia → 'dd/mm' · mês → 'Mmm/aa' */
function formatPeriodTick(period: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return `${period.slice(8, 10)}/${period.slice(5, 7)}`
  const month = Number(period.slice(5, 7))
  return `${MONTH_LABELS[month - 1].slice(0, 3)}/${period.slice(2, 4)}`
}

/** Título do tooltip: dia → '02/07/2026' · mês → 'Julho de 2026' */
function formatPeriodLong(period: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return formatDate(period)
  const month = Number(period.slice(5, 7))
  return `${MONTH_LABELS[month - 1]} de ${period.slice(0, 4)}`
}

/* ------------------------------- Tooltips ------------------------------- */

interface ChartTooltipProps {
  active?: boolean
  payload?: { payload?: unknown }[]
}

function TooltipShell({ title, rows }: { title: string; rows: { dot?: string; text: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-soft">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-1 space-y-0.5">
        {rows.map((row) => (
          <p key={row.text} className="flex items-center gap-1.5 text-ink-secondary">
            {row.dot && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.dot }}
                aria-hidden="true"
              />
            )}
            {row.text}
          </p>
        ))}
      </div>
    </div>
  )
}

function RevenueTooltip({ active, payload, groupBy }: ChartTooltipProps & { groupBy: GroupBy }) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload as RevenueBarDatum
  return (
    <TooltipShell
      title={formatPeriodLong(datum.period, groupBy)}
      rows={[
        { dot: CHART_COLORS.income, text: `Entradas: ${formatBRL(datum.incomeCents)}` },
        { dot: CHART_COLORS.expense, text: `Saídas: ${formatBRL(datum.expenseCents)}` },
      ]}
    />
  )
}

function TopServicesTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload as TopService
  return (
    <TooltipShell
      title={item.name}
      rows={[
        { text: `${item.count} ${item.count === 1 ? 'agendamento' : 'agendamentos'}` },
        { text: `Receita: ${formatBRL(item.revenueCents)}` },
      ]}
    />
  )
}

function RevenueRowTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload as RevenueRow
  return <TooltipShell title={item.label} rows={[{ text: formatBRL(item.valueCents) }]} />
}

function OccupancyTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload as OccupancyBarDatum
  return (
    <TooltipShell
      title={WEEKDAY_LABELS[item.dayOfWeek]}
      rows={[
        { text: `${item.percent}% de ocupação` },
        {
          text: `${formatHours(item.bookedMinutes)} agendadas de ${formatHours(
            item.availableMinutes,
          )} disponíveis`,
        },
      ]}
    />
  )
}

function NewClientsTooltip({ active, payload, groupBy }: ChartTooltipProps & { groupBy: GroupBy }) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload as { period: string; count: number }
  return (
    <TooltipShell
      title={formatPeriodLong(datum.period, groupBy)}
      rows={[{ text: `${datum.count} ${datum.count === 1 ? 'novo cliente' : 'novos clientes'}` }]}
    />
  )
}

function StatusTooltip({ active, payload, groupBy }: ChartTooltipProps & { groupBy: GroupBy }) {
  if (!active || !payload || payload.length === 0) return null
  const datum = payload[0].payload as AppointmentsByStatusPoint
  return (
    <TooltipShell
      title={formatPeriodLong(datum.period, groupBy)}
      rows={STATUS_META.map((meta) => ({
        dot: meta.color,
        text: `${meta.label}: ${datum[meta.key]}`,
      }))}
    />
  )
}

/* --------------------------- Estados por gráfico -------------------------- */

/** Alturas das barras fantasma do skeleton (escala de % para variação natural) */
const SKELETON_BAR_HEIGHTS = [
  'h-[55%]',
  'h-[75%]',
  'h-[40%]',
  'h-[85%]',
  'h-[60%]',
  'h-[35%]',
  'h-[70%]',
]

function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      className="flex items-end justify-around gap-3 px-4 pb-6 pt-4"
      style={{ height }}
      aria-hidden="true"
    >
      {SKELETON_BAR_HEIGHTS.map((barHeight, index) => (
        <Skeleton key={index} className={cn('w-6 rounded-b-none', barHeight)} />
      ))}
    </div>
  )
}

function ChartError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="flex h-[240px] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-ink-secondary">{errorMessage(error)}</p>
      <Button
        variant="outline"
        size="sm"
        leftIcon={<RefreshCw className="h-4 w-4" />}
        onClick={onRetry}
      >
        Tentar novamente
      </Button>
    </div>
  )
}

/** Barra horizontal genérica com valores em reais (serviços, clientes, colaboradores). Preenche a altura do pai (flex-1 min-h-0). */
function RevenueBarChart({ data }: { data: RevenueRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart layout="vertical" data={data} margin={{ top: 8, right: 76, left: 0, bottom: 0 }}>
        <XAxis
          type="number"
          axisLine={false}
          tickLine={false}
          tick={AXIS_TICK}
          tickFormatter={(value: number) => formatCompactBRL(value)}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          interval={0}
          axisLine={false}
          tickLine={false}
          tick={AXIS_TICK}
          tickFormatter={(value: string) => truncate(value, 16)}
        />
        <Tooltip
          cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
          content={<RevenueRowTooltip />}
        />
        <Bar
          dataKey="valueCents"
          name="Receita"
          fill={CHART_COLORS.series}
          maxBarSize={28}
          radius={[0, 4, 4, 0]}
        >
          <LabelList
            dataKey="valueCents"
            position="right"
            fill={CHART_COLORS.axisText}
            fontSize={12}
            formatter={(value: number) => formatCompactBRL(value)}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Donut de métodos de pagamento com legenda de valores ao lado. Preenche a altura do pai. */
function PaymentMethodsChart({ data }: { data: RevenueRow[] }) {
  return (
    <div className="flex h-full items-center gap-6">
      <div className="h-full w-full max-w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="valueCents"
              nameKey="label"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={3}
              stroke="none"
            >
              {data.map((row) => (
                <Cell key={row.key} fill={METHOD_COLORS[row.key as PaymentMethod]} />
              ))}
            </Pie>
            <Tooltip content={<RevenueRowTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {data.map((row) => (
          <div key={row.key} className="flex items-center gap-2 text-[13px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: METHOD_COLORS[row.key as PaymentMethod] }}
              aria-hidden="true"
            />
            <span className="truncate text-ink-secondary">{row.label}</span>
            <span className="ml-auto shrink-0 font-medium text-ink">
              {formatCompactBRL(row.valueCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------- Horários mais movimentados ------------------------ */

/** Total de agendamentos por hora do dia (soma de todos os dias da semana no período) */
function buildHourlySeries(cells: BusyHourCell[]): { hour: number; count: number }[] {
  let minHour = 23
  let maxHour = 0
  const totals = new Map<number, number>()
  for (const cell of cells) {
    minHour = Math.min(minHour, cell.hour)
    maxHour = Math.max(maxHour, cell.hour)
    totals.set(cell.hour, (totals.get(cell.hour) ?? 0) + cell.count)
  }
  if (minHour > maxHour) {
    minHour = 8
    maxHour = 20
  }
  const series: { hour: number; count: number }[] = []
  for (let hour = minHour; hour <= maxHour; hour += 1) {
    series.push({ hour, count: totals.get(hour) ?? 0 })
  }
  return series
}

function BusyHoursTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0].payload as { hour: number; count: number }
  return (
    <TooltipShell
      title={`${String(item.hour).padStart(2, '0')}h`}
      rows={[{ text: `${item.count} ${item.count === 1 ? 'agendamento' : 'agendamentos'}` }]}
    />
  )
}

function BusyHoursChart({ cells }: { cells: BusyHourCell[] }) {
  const series = useMemo(() => buildHourlySeries(cells), [cells])
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="hour"
          axisLine={false}
          tickLine={false}
          tick={AXIS_TICK}
          tickFormatter={(value: number) => `${String(value).padStart(2, '0')}h`}
        />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={AXIS_TICK} width={36} />
        <Tooltip cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }} content={<BusyHoursTooltip />} />
        <Line
          type="monotone"
          dataKey="count"
          name="Agendamentos"
          stroke={CHART_COLORS.series}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* --------------------------------- Página -------------------------------- */

export function ReportsPage() {
  const today = todayStr()
  const [from, setFrom] = useState(() => addDays(todayStr(), -29))
  const [to, setTo] = useState(() => todayStr())

  const rangeValid = from !== '' && to !== '' && from <= to
  const groupBy: GroupBy = rangeValid && diffInDays(from, to) > 62 ? 'month' : 'day'
  const activePresetDays = PRESETS.find(
    (preset) => to === today && from === addDays(today, -(preset.days - 1)),
  )?.days

  function applyPreset(days: number) {
    setTo(today)
    setFrom(addDays(today, -(days - 1)))
  }

  const revenueQuery = useQuery({
    queryKey: ['reports', 'revenue', { from, to, groupBy }],
    queryFn: () => getRevenueReport({ from, to, groupBy }),
    enabled: rangeValid,
  })

  const topServicesQuery = useQuery({
    queryKey: ['reports', 'top-services', { from, to }],
    queryFn: () => getTopServices({ from, to }),
    enabled: rangeValid,
  })

  const topServicesRevenueQuery = useQuery({
    queryKey: ['reports', 'top-services', 'revenue', { from, to }],
    queryFn: () => getTopServices({ from, to, sort: 'revenue' }),
    enabled: rangeValid,
  })

  const occupancyQuery = useQuery({
    queryKey: ['reports', 'occupancy', { from, to }],
    queryFn: () => getOccupancyReport({ from, to }),
    enabled: rangeValid,
  })

  const paymentMethodsQuery = useQuery({
    queryKey: ['reports', 'payment-methods', { from, to }],
    queryFn: () => getPaymentMethodsReport({ from, to }),
    enabled: rangeValid,
  })

  const topClientsQuery = useQuery({
    queryKey: ['reports', 'top-clients', { from, to }],
    queryFn: () => getTopClientsReport({ from, to }),
    enabled: rangeValid,
  })

  const revenueByEmployeeQuery = useQuery({
    queryKey: ['reports', 'revenue-by-employee', { from, to }],
    queryFn: () => getRevenueByEmployeeReport({ from, to }),
    enabled: rangeValid,
  })

  const newClientsQuery = useQuery({
    queryKey: ['reports', 'new-clients', { from, to, groupBy }],
    queryFn: () => getNewClientsReport({ from, to, groupBy }),
    enabled: rangeValid,
  })

  const statusQuery = useQuery({
    queryKey: ['reports', 'appointments-by-status', { from, to, groupBy }],
    queryFn: () => getAppointmentsByStatusReport({ from, to, groupBy }),
    enabled: rangeValid,
  })

  const busyHoursQuery = useQuery({
    queryKey: ['reports', 'busy-hours', { from, to }],
    queryFn: () => getBusyHoursReport({ from, to }),
    enabled: rangeValid,
  })

  /** Sequência completa de períodos (dias/meses) com buracos preenchidos com zero */
  const filledRevenue = useMemo<RevenueBarDatum[]>(() => {
    if (!rangeValid || !revenueQuery.data) return []
    const keyOf = (period: string) => (groupBy === 'month' ? period.slice(0, 7) : period.slice(0, 10))
    const byPeriod = new Map(revenueQuery.data.map((point) => [keyOf(point.period), point]))
    const periods = buildPeriodSequence(from, to, groupBy)
    return periods.map((period) => ({
      period,
      incomeCents: byPeriod.get(period)?.incomeCents ?? 0,
      expenseCents: byPeriod.get(period)?.expenseCents ?? 0,
    }))
  }, [rangeValid, revenueQuery.data, groupBy, from, to])

  const totals = useMemo(() => {
    const source = revenueQuery.data ?? []
    return {
      incomeCents: source.reduce((sum, point) => sum + point.incomeCents, 0),
      expenseCents: source.reduce((sum, point) => sum + point.expenseCents, 0),
    }
  }, [revenueQuery.data])

  const revenueEmpty =
    revenueQuery.data !== undefined &&
    (revenueQuery.data.length === 0 ||
      revenueQuery.data.every((point) => point.incomeCents === 0 && point.expenseCents === 0))

  const topServices = topServicesQuery.data ?? []
  const topServicesEmpty =
    topServicesQuery.data !== undefined &&
    (topServices.length === 0 || topServices.every((service) => service.count === 0))

  /** Métodos de pagamento como linhas de barra em reais */
  const paymentMethodRows = useMemo<RevenueRow[]>(() => {
    return (paymentMethodsQuery.data ?? [])
      .filter((item) => item.amountCents > 0)
      .map((item) => ({
        key: item.method,
        label: METHOD_LABELS[item.method],
        valueCents: item.amountCents,
      }))
  }, [paymentMethodsQuery.data])
  const paymentMethodsTotal = paymentMethodRows.reduce((sum, row) => sum + row.valueCents, 0)
  const paymentMethodsEmpty =
    paymentMethodsQuery.data !== undefined && paymentMethodRows.length === 0

  const topServicesRevenueRows = useMemo<RevenueRow[]>(() => {
    return (topServicesRevenueQuery.data ?? [])
      .filter((item) => item.revenueCents > 0)
      .map((item) => ({ key: item.serviceId, label: item.name, valueCents: item.revenueCents }))
  }, [topServicesRevenueQuery.data])
  const topServicesRevenueEmpty =
    topServicesRevenueQuery.data !== undefined && topServicesRevenueRows.length === 0

  const topClientRows = useMemo<RevenueRow[]>(() => {
    return (topClientsQuery.data ?? [])
      .filter((item) => item.revenueCents > 0)
      .map((item) => ({ key: item.clientId, label: item.name, valueCents: item.revenueCents }))
  }, [topClientsQuery.data])
  const topClientsEmpty = topClientsQuery.data !== undefined && topClientRows.length === 0

  const employeeRevenueRows = useMemo<RevenueRow[]>(() => {
    return (revenueByEmployeeQuery.data ?? [])
      .filter((item) => item.revenueCents > 0)
      .map((item) => ({ key: item.employeeId, label: item.name, valueCents: item.revenueCents }))
  }, [revenueByEmployeeQuery.data])
  const employeeRevenueEmpty =
    revenueByEmployeeQuery.data !== undefined && employeeRevenueRows.length === 0

  // Altura compartilhada entre os 2 gráficos de cada linha da grade, calculada
  // pelo maior número de itens dos dois, para as barras nunca ficarem
  // espremidas nem os cards da mesma linha ficarem com alturas diferentes.
  const rankingHeight = (...counts: number[]) => Math.max(240, Math.max(...counts) * 44)
  const servicesRowHeight = rankingHeight(topServices.length, topServicesRevenueRows.length)
  const peopleRowHeight = rankingHeight(topClientRows.length, employeeRevenueRows.length)

  /** Novos clientes por período, com buracos preenchidos com zero */
  const filledNewClients = useMemo(() => {
    if (!rangeValid || !newClientsQuery.data) return []
    const byPeriod = new Map(newClientsQuery.data.map((point) => [point.period, point.count]))
    return buildPeriodSequence(from, to, groupBy).map((period) => ({
      period,
      count: byPeriod.get(period) ?? 0,
    }))
  }, [rangeValid, newClientsQuery.data, from, to, groupBy])
  const newClientsTotal = (newClientsQuery.data ?? []).reduce((sum, point) => sum + point.count, 0)
  const newClientsEmpty = newClientsQuery.data !== undefined && newClientsTotal === 0

  /** Agendamentos por status por período, com buracos preenchidos com zero */
  const filledStatus = useMemo<AppointmentsByStatusPoint[]>(() => {
    if (!rangeValid || !statusQuery.data) return []
    const byPeriod = new Map(statusQuery.data.map((point) => [point.period, point]))
    return buildPeriodSequence(from, to, groupBy).map((period) => {
      const point = byPeriod.get(period)
      return {
        period,
        confirmed: point?.confirmed ?? 0,
        pending: point?.pending ?? 0,
        completed: point?.completed ?? 0,
        cancelled: point?.cancelled ?? 0,
      }
    })
  }, [rangeValid, statusQuery.data, from, to, groupBy])

  const statusTotals = useMemo(() => {
    const source = statusQuery.data ?? []
    const cancelled = source.reduce((sum, point) => sum + point.cancelled, 0)
    const total = source.reduce(
      (sum, point) => sum + point.confirmed + point.pending + point.completed + point.cancelled,
      0,
    )
    return { cancelled, total, cancelRate: total > 0 ? Math.round((cancelled / total) * 100) : 0 }
  }, [statusQuery.data])
  const statusEmpty = statusQuery.data !== undefined && statusTotals.total === 0

  const busyHours = busyHoursQuery.data ?? []
  const busyHoursEmpty = busyHoursQuery.data !== undefined && busyHours.length === 0

  /** Semana ordenada seg→dom, preenchendo dias ausentes com zero */
  const occupancyData = useMemo<OccupancyBarDatum[]>(() => {
    const byDay = new Map((occupancyQuery.data ?? []).map((item) => [item.dayOfWeek, item]))
    return [1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
      const item = byDay.get(dayOfWeek)
      return {
        dayOfWeek,
        label: WEEKDAY_LABELS_SHORT[dayOfWeek],
        percent: Math.round((item?.rate ?? 0) * 100),
        bookedMinutes: item?.bookedMinutes ?? 0,
        availableMinutes: item?.availableMinutes ?? 0,
      }
    })
  }, [occupancyQuery.data])

  const occupancyEmpty =
    occupancyQuery.data !== undefined &&
    (occupancyQuery.data.length === 0 ||
      occupancyQuery.data.every((item) => item.bookedMinutes === 0 && item.availableMinutes === 0))

  const renderLegendText = (value: string) => (
    <span className="text-xs" style={{ color: CHART_COLORS.axisText }}>
      {value}
    </span>
  )

  /** Fluxo padrão de estado de um card: skeleton → erro → vazio → conteúdo */
  function renderChart(options: {
    query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => void }
    empty: boolean
    emptyDescription: string
    height?: number
    children: React.ReactNode
  }) {
    if (options.query.isPending) return <ChartSkeleton height={options.height} />
    if (options.query.isError)
      return <ChartError error={options.query.error} onRetry={() => options.query.refetch()} />
    if (options.empty)
      return (
        <EmptyState
          icon={BarChart3}
          title="Sem dados no período"
          description={options.emptyDescription}
        />
      )
    return <>{options.children}</>
  }

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Acompanhe faturamento, clientes, serviços e ocupação da agenda"
      />

      {/* Toolbar de período: presets + intervalo customizado */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Períodos rápidos">
          {PRESETS.map((preset) => (
            <Button
              key={preset.days}
              type="button"
              size="sm"
              variant={activePresetDays === preset.days ? 'secondary' : 'ghost'}
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <span className="hidden h-5 w-px bg-line sm:block" aria-hidden="true" />
        <div className="flex items-center gap-2">
          <div className="w-36 sm:w-40">
            <Input
              type="date"
              aria-label="Data inicial"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <span className="text-[13px] text-ink-tertiary">até</span>
          <div className="w-36 sm:w-40">
            <Input
              type="date"
              aria-label="Data final"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
      </div>

      {!rangeValid ? (
        <EmptyState
          icon={BarChart3}
          title="Período inválido"
          description="Escolha uma data inicial anterior (ou igual) à data final para gerar os relatórios."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* 1. Faturamento no período */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Faturamento no período</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: revenueQuery,
                empty: revenueEmpty,
                emptyDescription: 'Nenhuma entrada ou saída registrada no intervalo selecionado.',
                height: 300,
                children: (
                  <>
                    <p className="mb-4 text-[13px] text-ink-secondary">
                      Total de entradas:{' '}
                      <span className="font-semibold text-ink">{formatBRL(totals.incomeCents)}</span>
                      <span className="mx-1.5 text-ink-disabled">·</span>
                      Saídas:{' '}
                      <span className="font-semibold text-ink">
                        {formatBRL(totals.expenseCents)}
                      </span>
                    </p>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filledRevenue}
                          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                          <XAxis
                            dataKey="period"
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            minTickGap={16}
                            tickFormatter={(value: string) => formatPeriodTick(value, groupBy)}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            width={84}
                            tickFormatter={(value: number) => formatCompactBRL(value)}
                          />
                          <Tooltip
                            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
                            content={<RevenueTooltip groupBy={groupBy} />}
                          />
                          <Legend
                            iconType="circle"
                            iconSize={8}
                            verticalAlign="bottom"
                            formatter={renderLegendText}
                          />
                          <Bar
                            dataKey="incomeCents"
                            name="Entradas"
                            fill={CHART_COLORS.income}
                            maxBarSize={24}
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="expenseCents"
                            name="Saídas"
                            fill={CHART_COLORS.expense}
                            maxBarSize={24}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ),
              })}
            </CardContent>
          </Card>

          {/* 2. Recebido por método */}
          <Card>
            <CardHeader>
              <CardTitle>Recebido por método</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: paymentMethodsQuery,
                empty: paymentMethodsEmpty,
                emptyDescription: 'Nenhum pagamento confirmado no intervalo selecionado.',
                children: (
                  <>
                    <p className="mb-4 text-[13px] text-ink-secondary">
                      Total recebido:{' '}
                      <span className="font-semibold text-ink">
                        {formatBRL(paymentMethodsTotal)}
                      </span>
                    </p>
                    <div className="h-[280px]">
                      <PaymentMethodsChart data={paymentMethodRows} />
                    </div>
                  </>
                ),
              })}
            </CardContent>
          </Card>

          {/* 3. Novos clientes por período */}
          <Card>
            <CardHeader>
              <CardTitle>Novos clientes</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: newClientsQuery,
                empty: newClientsEmpty,
                emptyDescription: 'Nenhum cliente cadastrado no intervalo selecionado.',
                children: (
                  <>
                    <p className="mb-4 text-[13px] text-ink-secondary">
                      Total no período:{' '}
                      <span className="font-semibold text-ink">{newClientsTotal}</span>
                    </p>
                    <div className="h-[280px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={filledNewClients}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                          <XAxis
                            dataKey="period"
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            minTickGap={16}
                            tickFormatter={(value: string) => formatPeriodTick(value, groupBy)}
                          />
                          <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            width={36}
                          />
                          <Tooltip
                            cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
                            content={<NewClientsTooltip groupBy={groupBy} />}
                          />
                          <Line
                            type="monotone"
                            dataKey="count"
                            name="Novos clientes"
                            stroke={CHART_COLORS.series}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ),
              })}
            </CardContent>
          </Card>

          {/* 4. Serviços mais agendados */}
          <Card>
            <CardHeader>
              <CardTitle>Serviços mais agendados</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: topServicesQuery,
                empty: topServicesEmpty,
                emptyDescription: 'Nenhum serviço agendado no intervalo selecionado.',
                children: (
                  <div style={{ height: servicesRowHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={topServices}
                        margin={{ top: 8, right: 36, left: 0, bottom: 0 }}
                      >
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          axisLine={false}
                          tickLine={false}
                          tick={AXIS_TICK}
                        />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={140}
                          interval={0}
                          axisLine={false}
                          tickLine={false}
                          tick={AXIS_TICK}
                          tickFormatter={(value: string) => truncate(value, 18)}
                        />
                        <Tooltip
                          cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
                          content={<TopServicesTooltip />}
                        />
                        <Bar
                          dataKey="count"
                          name="Agendamentos"
                          fill={CHART_COLORS.series}
                          maxBarSize={26}
                          radius={[0, 4, 4, 0]}
                        >
                          <LabelList
                            dataKey="count"
                            position="right"
                            fill={CHART_COLORS.axisText}
                            fontSize={12}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              })}
            </CardContent>
          </Card>

          {/* 5. Serviços que mais faturam */}
          <Card>
            <CardHeader>
              <CardTitle>Serviços que mais faturam</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: topServicesRevenueQuery,
                empty: topServicesRevenueEmpty,
                emptyDescription: 'Nenhuma receita de serviço no intervalo selecionado.',
                children: (
                  <div style={{ height: servicesRowHeight }}>
                    <RevenueBarChart data={topServicesRevenueRows} />
                  </div>
                ),
              })}
            </CardContent>
          </Card>

          {/* 6. Clientes que mais gastam */}
          <Card>
            <CardHeader>
              <CardTitle>Clientes que mais gastam</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: topClientsQuery,
                empty: topClientsEmpty,
                emptyDescription: 'Nenhum faturamento por cliente no intervalo selecionado.',
                children: (
                  <div style={{ height: peopleRowHeight }}>
                    <RevenueBarChart data={topClientRows} />
                  </div>
                ),
              })}
            </CardContent>
          </Card>

          {/* 7. Faturamento por colaborador */}
          <Card>
            <CardHeader>
              <CardTitle>Faturamento por colaborador</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: revenueByEmployeeQuery,
                empty: employeeRevenueEmpty,
                emptyDescription: 'Nenhuma receita por colaborador no intervalo selecionado.',
                children: (
                  <div style={{ height: peopleRowHeight }}>
                    <RevenueBarChart data={employeeRevenueRows} />
                  </div>
                ),
              })}
            </CardContent>
          </Card>

          {/* 8. Agendamentos por status */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Agendamentos por status</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: statusQuery,
                empty: statusEmpty,
                emptyDescription: 'Nenhum agendamento no intervalo selecionado.',
                height: 300,
                children: (
                  <>
                    <p className="mb-4 text-[13px] text-ink-secondary">
                      Total de agendamentos:{' '}
                      <span className="font-semibold text-ink">{statusTotals.total}</span>
                      <span className="mx-1.5 text-ink-disabled">·</span>
                      Taxa de cancelamento:{' '}
                      <span className="font-semibold text-ink">{statusTotals.cancelRate}%</span>
                    </p>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={filledStatus}
                          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                          <XAxis
                            dataKey="period"
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            minTickGap={16}
                            tickFormatter={(value: string) => formatPeriodTick(value, groupBy)}
                          />
                          <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={AXIS_TICK}
                            width={36}
                          />
                          <Tooltip
                            cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
                            content={<StatusTooltip groupBy={groupBy} />}
                          />
                          <Legend
                            iconType="circle"
                            iconSize={8}
                            verticalAlign="bottom"
                            formatter={renderLegendText}
                          />
                          {STATUS_META.map((meta) => (
                            <Bar
                              key={meta.key}
                              dataKey={meta.key}
                              name={meta.label}
                              stackId="status"
                              fill={meta.color}
                              maxBarSize={28}
                            />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                ),
              })}
            </CardContent>
          </Card>

          {/* 9. Horários mais movimentados */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Horários mais movimentados</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: busyHoursQuery,
                empty: busyHoursEmpty,
                emptyDescription: 'Nenhum agendamento no intervalo selecionado.',
                height: 280,
                children: (
                  <div className="h-[280px]">
                    <BusyHoursChart cells={busyHours} />
                  </div>
                ),
              })}
            </CardContent>
          </Card>

          {/* 10. Ocupação por dia da semana */}
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Ocupação por dia da semana</CardTitle>
            </CardHeader>
            <CardContent>
              {renderChart({
                query: occupancyQuery,
                empty: occupancyEmpty,
                emptyDescription: 'Nenhum horário disponível ou agendado no intervalo selecionado.',
                children: (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={occupancyData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                        <XAxis
                          dataKey="label"
                          interval={0}
                          axisLine={false}
                          tickLine={false}
                          tick={AXIS_TICK}
                        />
                        <YAxis
                          domain={[0, 100]}
                          ticks={[0, 25, 50, 75, 100]}
                          axisLine={false}
                          tickLine={false}
                          tick={AXIS_TICK}
                          width={44}
                          tickFormatter={(value: number) => `${value}%`}
                        />
                        <Tooltip
                          cursor={{ fill: CHART_COLORS.grid, fillOpacity: 0.4 }}
                          content={<OccupancyTooltip />}
                        />
                        <Bar
                          dataKey="percent"
                          name="Ocupação"
                          fill={CHART_COLORS.series}
                          barSize={22}
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ),
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
