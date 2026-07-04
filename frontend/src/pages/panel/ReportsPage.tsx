import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, RefreshCw } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ApiError } from '../../api/client'
import { getOccupancyReport, getRevenueReport, getTopServices } from '../../api/reports'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { CHART_COLORS } from '../../lib/chartColors'
import {
  MONTH_LABELS,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SHORT,
  addDays,
  parseDate,
  todayStr,
} from '../../lib/dates'
import { cn, formatBRL, formatDate } from '../../lib/format'
import type { TopService } from '../../types/api'

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

const PRESETS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: '90 dias', days: 90 },
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

  const occupancyQuery = useQuery({
    queryKey: ['reports', 'occupancy', { from, to }],
    queryFn: () => getOccupancyReport({ from, to }),
    enabled: rangeValid,
  })

  /** Sequência completa de períodos (dias/meses) com buracos preenchidos com zero */
  const filledRevenue = useMemo<RevenueBarDatum[]>(() => {
    if (!rangeValid || !revenueQuery.data) return []
    const keyOf = (period: string) => (groupBy === 'month' ? period.slice(0, 7) : period.slice(0, 10))
    const byPeriod = new Map(revenueQuery.data.map((point) => [keyOf(point.period), point]))
    const periods = groupBy === 'month' ? buildMonthSequence(from, to) : buildDaySequence(from, to)
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

  return (
    <div>
      <PageHeader
        title="Relatórios"
        description="Acompanhe faturamento, serviços mais procurados e ocupação da agenda"
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
              {revenueQuery.isPending ? (
                <ChartSkeleton height={300} />
              ) : revenueQuery.isError ? (
                <ChartError error={revenueQuery.error} onRetry={() => revenueQuery.refetch()} />
              ) : revenueEmpty ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sem dados no período"
                  description="Nenhuma entrada ou saída registrada no intervalo selecionado."
                />
              ) : (
                <>
                  <p className="mb-4 text-[13px] text-ink-secondary">
                    Total de entradas:{' '}
                    <span className="font-semibold text-ink">{formatBRL(totals.incomeCents)}</span>
                    <span className="mx-1.5 text-ink-disabled">·</span>
                    Saídas:{' '}
                    <span className="font-semibold text-ink">{formatBRL(totals.expenseCents)}</span>
                  </p>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filledRevenue} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
              )}
            </CardContent>
          </Card>

          {/* 2. Serviços mais agendados */}
          <Card>
            <CardHeader>
              <CardTitle>Serviços mais agendados</CardTitle>
            </CardHeader>
            <CardContent>
              {topServicesQuery.isPending ? (
                <ChartSkeleton height={280} />
              ) : topServicesQuery.isError ? (
                <ChartError
                  error={topServicesQuery.error}
                  onRetry={() => topServicesQuery.refetch()}
                />
              ) : topServicesEmpty ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sem dados no período"
                  description="Nenhum serviço agendado no intervalo selecionado."
                />
              ) : (
                <div style={{ height: Math.max(220, topServices.length * 48) }}>
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
                        barSize={22}
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
              )}
            </CardContent>
          </Card>

          {/* 3. Ocupação por dia da semana */}
          <Card>
            <CardHeader>
              <CardTitle>Ocupação por dia da semana</CardTitle>
            </CardHeader>
            <CardContent>
              {occupancyQuery.isPending ? (
                <ChartSkeleton height={280} />
              ) : occupancyQuery.isError ? (
                <ChartError error={occupancyQuery.error} onRetry={() => occupancyQuery.refetch()} />
              ) : occupancyEmpty ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sem dados no período"
                  description="Nenhum horário disponível ou agendado no intervalo selecionado."
                />
              ) : (
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
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
