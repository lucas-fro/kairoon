import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarCheck,
  CalendarClock,
  Gauge,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link, useNavigate } from 'react-router-dom'
import { getDashboardSummary } from '../../api/dashboard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { CHART_COLORS } from '../../lib/chartColors'
import { todayStr } from '../../lib/dates'
import { formatBRL } from '../../lib/format'
import type { AppointmentStatus, DashboardTrendPoint } from '../../types/api'

const STATUS_META: Record<AppointmentStatus, { label: string; tone: 'success' | 'brand' | 'warning' | 'error' }> = {
  confirmed: { label: 'Confirmado', tone: 'success' },
  completed: { label: 'Concluído', tone: 'brand' },
  pending: { label: 'Pendente', tone: 'warning' },
  cancelled: { label: 'Cancelado', tone: 'error' },
}

/** Média com 1 decimal em pt-BR: 2.333 → '2,3' */
function formatAvg(value: number): string {
  return value.toFixed(1).replace('.', ',')
}

/* ------------------------------ StatCard ------------------------------ */

/** Pílula de variação vs. mês anterior — verde/vermelho por direção, "Novo" sem base de comparação. */
function ChangeBadge({ pct, current }: { pct: number | null; current: number }) {
  if (pct === null) {
    if (current <= 0) return null
    return (
      <Badge tone="neutral" className="!h-5 shrink-0 !px-1.5 !text-[11px]">
        Novo
      </Badge>
    )
  }
  const positive = pct >= 0
  return (
    <Badge
      tone={positive ? 'success' : 'error'}
      className="!h-5 shrink-0 gap-0.5 !px-1.5 !text-[11px] tabular-nums"
    >
      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct)}%
    </Badge>
  )
}

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  sub: string
  changePct: number | null
  current: number
}

function StatCard({ icon: Icon, label, value, sub, changePct, current }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Icon className="h-4 w-4 shrink-0 text-ink-tertiary" strokeWidth={1.9} />
            <p className="truncate text-[13px] text-ink-secondary">{label}</p>
          </div>
          <ChangeBadge pct={changePct} current={current} />
        </div>
        <p className="mt-2 font-display text-[28px] font-bold leading-tight tabular-nums text-ink">
          {value}
        </p>
        <p className="mt-1 text-xs text-ink-tertiary">{sub}</p>
      </CardContent>
    </Card>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i}>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-5 w-12 rounded-md" />
              </div>
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-6 h-[260px] w-full rounded-lg" />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Skeleton className="h-5 w-48" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ---------------------------- Gráfico de linhas --------------------------- */

interface TrendTooltipProps {
  active?: boolean
  payload?: { payload?: DashboardTrendPoint }[]
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null
  const datum = payload[0].payload
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-soft">
      <p className="font-semibold text-ink">
        {datum.date.slice(8, 10)}/{datum.date.slice(5, 7)}
      </p>
      <div className="mt-1 space-y-0.5">
        <p className="flex items-center gap-1.5 text-ink-secondary">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: CHART_COLORS.income }}
            aria-hidden="true"
          />
          {datum.appointmentsCount} {datum.appointmentsCount === 1 ? 'agendamento' : 'agendamentos'}
        </p>
        <p className="flex items-center gap-1.5 text-ink-secondary">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: CHART_COLORS.expense }}
            aria-hidden="true"
          />
          {datum.newClientsCount} {datum.newClientsCount === 1 ? 'novo cliente' : 'novos clientes'}
        </p>
      </div>
    </div>
  )
}

const AXIS_TICK = { fill: CHART_COLORS.axisText, fontSize: 12 }

function ActivityTrendCard({ trend }: { trend: DashboardTrendPoint[] }) {
  const empty = trend.every((point) => point.appointmentsCount === 0 && point.newClientsCount === 0)

  const renderLegendText = (value: string) => (
    <span className="text-xs" style={{ color: CHART_COLORS.axisText }}>
      {value}
    </span>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agendamentos e novos clientes no mês</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <EmptyState
            icon={TrendingUp}
            title="Sem atividade este mês"
            description="Assim que houver agendamentos ou novos clientes, o gráfico aparece aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <div className="h-[260px] min-w-[480px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={AXIS_TICK}
                  minTickGap={16}
                  tickFormatter={(value: string) => `${value.slice(8, 10)}/${value.slice(5, 7)}`}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={AXIS_TICK}
                  width={32}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: CHART_COLORS.grid, strokeWidth: 1 }}
                  content={<TrendTooltip />}
                />
                <Legend iconType="circle" iconSize={8} verticalAlign="bottom" formatter={renderLegendText} />
                <Line
                  type="monotone"
                  dataKey="appointmentsCount"
                  name="Agendamentos"
                  stroke={CHART_COLORS.income}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="newClientsCount"
                  name="Novos clientes"
                  stroke={CHART_COLORS.expense}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* --------------------------------- Página -------------------------------- */

export function DashboardPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardSummary,
    refetchInterval: 30000,
  })

  const today = todayStr()

  const header = (
    <PageHeader title="Dashboard" />
  )

  if (isPending) {
    return (
      <div>
        {header}
        <DashboardSkeleton />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div>
        {header}
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl bg-surface px-6 py-16 text-center shadow-card">
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-error-light">
            <AlertCircle className="h-6 w-6 text-error-dark" />
          </div>
          <p className="text-sm text-ink-secondary">Não foi possível carregar o resumo do dia.</p>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<RefreshCw className="h-4 w-4" />}
            isLoading={isRefetching}
            onClick={() => refetch()}
          >
            Tentar de novo
          </Button>
        </div>
      </div>
    )
  }

  const month = data.month
  const avgTicketCents =
    month.completedCount > 0 ? Math.round(month.revenueCents / month.completedCount) : 0
  const daysElapsed = Number(today.slice(8, 10))
  const dailyAvgAppointments = daysElapsed > 0 ? month.appointmentsCount / daysElapsed : 0
  const dailyAvgNewClients = daysElapsed > 0 ? month.newClients / daysElapsed : 0
  const occupancyPct = Math.round(month.occupancyRate * 100)
  const todayOccupancyPct = Math.round(month.todayOccupancyRate * 100)

  return (
    <div>
      {header}

      <div className="space-y-6">
        {/* 1ª linha: 4 KPIs do mês, com média/total e variação vs. mês anterior */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Faturamento do mês"
            value={formatBRL(month.revenueCents)}
            sub={`Ticket médio: ${formatBRL(avgTicketCents)}`}
            changePct={month.revenueChangePct}
            current={month.revenueCents}
          />
          <StatCard
            icon={CalendarCheck}
            label="Agendamentos do mês"
            value={String(month.appointmentsCount)}
            sub={`Média diária: ${formatAvg(dailyAvgAppointments)}`}
            changePct={month.appointmentsChangePct}
            current={month.appointmentsCount}
          />
          <StatCard
            icon={Users}
            label="Novos clientes no mês"
            value={String(month.newClients)}
            sub={`Média diária: ${formatAvg(dailyAvgNewClients)}`}
            changePct={month.newClientsChangePct}
            current={month.newClients}
          />
          <StatCard
            icon={Gauge}
            label="Ocupação de hoje"
            value={`${todayOccupancyPct}%`}
            sub={`Mês: ${occupancyPct}%`}
            changePct={month.occupancyChangePct}
            current={month.occupancyRate}
          />
        </div>

        {/* 2ª linha: gráfico de linhas — atividade de clientes, não financeiro */}
        <ActivityTrendCard trend={data.trend} />

        {/* 3ª linha: tabela de agendamentos de hoje */}
        <Card>
          <CardHeader className="flex-wrap">
            <CardTitle>Agendamentos de hoje</CardTitle>
            <Link
              to="/app/agenda"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
            >
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          {data.todayAppointments.length === 0 ? (
            <CardContent className="pt-4">
              <EmptyState
                icon={CalendarClock}
                title="Nenhum agendamento hoje"
                description="Quando novos horários forem marcados, eles aparecem aqui."
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/agenda')}>
                    Ver agenda
                  </Button>
                }
              />
            </CardContent>
          ) : (
            <div className="mt-2 max-h-[320px] overflow-y-auto">
              <Table>
                <THead className="sticky top-0 z-10 bg-surface">
                  <tr>
                    <Th className="w-24 !h-9 !px-3">Horário</Th>
                    <Th className="!h-9 !px-3">Cliente</Th>
                    <Th className="!h-9 !px-3">Serviço</Th>
                    <Th className="!h-9 !px-3">Profissional</Th>
                    <Th className="w-32 !h-9 !px-3">Status</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.todayAppointments.map((appointment) => {
                    const status = STATUS_META[appointment.status]
                    return (
                      <Tr key={appointment.id}>
                        <Td className="!h-auto whitespace-nowrap !px-3 !py-2.5 text-[13px] tabular-nums text-ink-secondary">
                          {appointment.startTime}–{appointment.endTime}
                        </Td>
                        <Td className="!h-auto !px-3 !py-2.5 text-[13px] font-medium text-ink">
                          {appointment.clientName}
                        </Td>
                        <Td className="!h-auto !px-3 !py-2.5 text-[13px] text-ink-secondary">
                          {appointment.serviceName}
                        </Td>
                        <Td className="!h-auto !px-3 !py-2.5 text-[13px] text-ink-secondary">
                          {appointment.employeeName}
                        </Td>
                        <Td className="!h-auto !px-3 !py-2.5">
                          <Badge tone={status.tone} className="!h-5 !px-1.5 !text-[11px]">
                            {status.label}
                          </Badge>
                        </Td>
                      </Tr>
                    )
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
