import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  CalendarClock,
  Gauge,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getDashboardSummary } from '../../api/dashboard'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Skeleton } from '../../components/ui/Skeleton'
import { todayStr } from '../../lib/dates'
import { formatBRL, formatDateLong } from '../../lib/format'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string
  children?: ReactNode
}

function StatCard({ icon: Icon, label, value, children }: StatCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] text-ink-secondary">{label}</p>
          <Icon className="h-[18px] w-[18px] shrink-0 text-ink-tertiary" strokeWidth={1.9} />
        </div>
        <p className="mt-2 font-display text-[28px] font-bold leading-tight tabular-nums text-ink">
          {value}
        </p>
        {children}
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
                <Skeleton className="h-[18px] w-[18px]" />
              </div>
              <Skeleton className="mt-3 h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent>
          <Skeleton className="h-5 w-64" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data, isPending, isError, refetch, isRefetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboardSummary,
    refetchInterval: 30000,
  })

  const header = (
    <PageHeader
      title="Dashboard"
      description={`Visão geral de hoje, ${formatDateLong(todayStr())}`}
    />
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

  const occupancyPct = Math.min(100, Math.max(0, Math.round(data.occupancyRate * 100)))

  return (
    <div>
      {header}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={CalendarCheck}
            label="Agendamentos hoje"
            value={String(data.todayAppointments)}
          />
          <StatCard
            icon={Wallet}
            label="Faturamento do dia"
            value={formatBRL(data.todayRevenueCents)}
          >
            <p className="mt-2 text-xs text-ink-tertiary">
              Mês:{' '}
              <span className="font-medium text-ink-secondary">
                {formatBRL(data.monthRevenueCents)}
              </span>
            </p>
          </StatCard>
          <StatCard
            icon={Users}
            label="Novos clientes no mês"
            value={String(data.newClientsThisMonth)}
          />
          <StatCard icon={Gauge} label="Taxa de ocupação hoje" value={`${occupancyPct}%`}>
            <div
              className="mt-3 h-1.5 w-full overflow-hidden rounded bg-line-divider"
              role="progressbar"
              aria-valuenow={occupancyPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Taxa de ocupação hoje"
            >
              <div
                className="h-full rounded bg-primary transition-all duration-200"
                style={{ width: `${occupancyPct}%` }}
              />
            </div>
          </StatCard>
        </div>

        <Card>
          <CardHeader className="flex-wrap">
            <CardTitle>Próximos agendamentos de hoje</CardTitle>
            <Link
              to="/app/agenda"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors duration-150 hover:text-primary-hover"
            >
              Ver agenda completa
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {data.nextAppointments.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nenhum agendamento restante hoje"
                description="Quando novos horários forem marcados, eles aparecem aqui."
                action={
                  <Button variant="outline" size="sm" onClick={() => navigate('/app/agenda')}>
                    Ver agenda
                  </Button>
                }
              />
            ) : (
              <ul>
                {data.nextAppointments.map((appointment) => (
                  <li
                    key={appointment.id}
                    className="flex h-14 items-center gap-4 border-b border-line-divider last:border-0"
                  >
                    <Badge tone="brand" className="shrink-0 tabular-nums">
                      {appointment.startTime}–{appointment.endTime}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-medium text-ink">{appointment.clientName}</span>
                        <span className="text-ink-secondary"> · {appointment.serviceName}</span>
                      </p>
                      <p className="truncate text-xs text-ink-tertiary">
                        {appointment.employeeName}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
