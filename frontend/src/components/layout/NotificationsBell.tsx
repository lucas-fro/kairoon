import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Bell,
  Cake,
  CalendarClock,
  CalendarPlus,
  CheckCheck,
  Clock,
  PackageMinus,
  Receipt,
  Wallet,
} from 'lucide-react'
import { listAppointments, listRecentAppointments } from '../../api/appointments'
import { listClients } from '../../api/clients'
import { listProducts } from '../../api/products'
import { getRecurringExpensesForecast } from '../../api/recurringExpenses'
import { listWaitlist } from '../../api/waitlist'
import { addDays, timeToMinutes, todayStr } from '../../lib/dates'
import { cn, formatBRL, formatDate, timeAgo } from '../../lib/format'
import { useAuth } from '../../contexts/AuthContext'
import { useDropdown } from '../../hooks/useDropdown'
import { PendingAppointmentDialog, toPendingView } from '../realtime/PendingAppointmentDialog'
import type { PendingAppointmentView } from '../realtime/PendingAppointmentDialog'
import { Spinner } from '../ui/Spinner'

const LOW_STOCK = 5

type Tone = 'warning' | 'info' | 'error' | 'success' | 'brand'

// Fundos vivos em valor direto (ver nota em WeekGrid: tokens novos do config não
// recarregam via HMR; o hex garante a cor na hora). Texto na variante -dark.
const toneClasses: Record<Tone, string> = {
  warning: 'bg-[#FDE68A] text-warning-dark',
  info: 'bg-[#BAE6FD] text-info-dark',
  error: 'bg-[#FECACA] text-error-dark',
  success: 'bg-[#BBF7D0] text-success-dark',
  brand: 'bg-primary text-white',
}

interface NotificationItem {
  id: string
  icon: LucideIcon
  tone: Tone
  title: string
  description: string
  /** ISO de quando o evento aconteceu: exibido como "há X" no rodapé */
  timestamp?: string
  onClick: () => void
}

function isBirthdayToday(birthDate: string | null, today: string): boolean {
  if (!birthDate || birthDate.length < 10) return false
  return birthDate.slice(5, 10) === today.slice(5, 10)
}

export function NotificationsBell() {
  const { open, setOpen, ref } = useDropdown()
  const navigate = useNavigate()
  const { can } = useAuth()
  const [selected, setSelected] = useState<PendingAppointmentView | null>(null)

  // O sino vive no header de toda página autenticada, então cada bloco só busca
  // dado se a sessão tiver a permissão da área. Sem isto, um profissional comum
  // tomaria 403 em várias rotas a cada navegação.
  const canAgenda = can('agenda.view')
  // Confirmar é 'agenda.edit' e recusar é 'agenda.cancel'. Sem os dois o popup
  // de aprovação só serviria para tomar 403 nos dois botões, então a notificação
  // continua aparecendo (é informação de agenda) mas leva à agenda, como as
  // outras do bloco.
  const canResolvePending = can('agenda.edit') && can('agenda.cancel')
  const canClients = can('clients.view')
  const canStock = can('stock.view')
  const canFinance = can('finance.view')

  const today = todayStr()
  const tomorrow = addDays(today, 1)
  const month = today.slice(0, 7)
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  // Agendamentos pendentes de aprovação (janela larga cobre reservas futuras)
  const pendingQuery = useQuery({
    queryKey: ['appointments', 'pending', today],
    queryFn: () => listAppointments({ start: today, end: addDays(today, 365), status: 'pending' }),
    refetchInterval: 45000,
    enabled: canAgenda,
  })
  // Agendamentos criados nas últimas 24h (por data de criação): "novo agendamento"
  const recentQuery = useQuery({
    queryKey: ['appointments', 'recent'],
    queryFn: () => listRecentAppointments(24),
    refetchInterval: 45000,
    enabled: canAgenda,
  })
  // Atendimentos de hoje já confirmados (para achar os que passaram e não fecharam)
  const todayConfirmedQuery = useQuery({
    queryKey: ['appointments', 'notif-today', today],
    queryFn: () => listAppointments({ start: today, end: today, status: 'confirmed' }),
    refetchInterval: 60000,
    enabled: canAgenda,
  })
  const waitlistQuery = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => listWaitlist({ status: 'waiting' }),
    refetchInterval: 60000,
    enabled: canAgenda,
  })
  // Sem 'clients.view' a rota exige termo de busca de 2+ caracteres, e aqui a
  // chamada é sem termo: só busca quem pode ver a carteira inteira.
  const clientsQuery = useQuery({
    queryKey: ['clients', ''],
    queryFn: () => listClients(),
    refetchInterval: 300000,
    enabled: canClients,
  })
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
    refetchInterval: 300000,
    enabled: canStock,
  })
  const forecastQuery = useQuery({
    queryKey: ['recurring-expenses', 'forecast', month],
    queryFn: () => getRecurringExpensesForecast(month),
    refetchInterval: 300000,
    enabled: canFinance,
  })

  function go(path: string) {
    setOpen(false)
    navigate(path)
  }

  const notifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = []

    // 1. Agendamentos a aprovar (link público)
    for (const a of pendingQuery.data ?? []) {
      list.push({
        id: `pending:${a.id}`,
        icon: CalendarClock,
        tone: 'warning',
        title: 'Agendamento a aprovar',
        description: `${a.client.name} · ${a.service.name} · ${formatDate(a.date)} ${a.startTime}`,
        timestamp: a.createdAt,
        onClick: canResolvePending
          ? () => {
              setSelected(toPendingView(a))
              setOpen(false)
            }
          : () => go('/app/agenda'),
      })
    }

    // 2. Novos agendamentos (criados nas últimas 24h e já confirmados). Os
    // pendentes aparecem acima como "a aprovar", então aqui só entram os
    // confirmados: reservas auto-confirmadas do link público e do painel.
    for (const a of recentQuery.data ?? []) {
      if (a.status !== 'confirmed') continue
      list.push({
        id: `new:${a.id}`,
        icon: CalendarPlus,
        tone: 'success',
        title: 'Novo agendamento',
        description: `${a.client.name} · ${a.service.name} · ${formatDate(a.date)} ${a.startTime}`,
        timestamp: a.createdAt,
        onClick: () => go('/app/agenda'),
      })
    }

    // 3. Atendimentos de hoje que já passaram e não foram fechados
    for (const a of todayConfirmedQuery.data ?? []) {
      if (timeToMinutes(a.endTime) <= nowMin) {
        list.push({
          id: `unclosed:${a.id}`,
          icon: AlertTriangle,
          tone: 'error',
          title: 'Atendimento não fechado',
          description: `${a.client.name} · ${a.startTime} · conclua ou remarque`,
          onClick: () => go('/app/agenda'),
        })
      }
    }

    // 4. Fila de espera: para hoje, vencida, ou esperando há muito tempo
    for (const w of waitlistQuery.data ?? []) {
      const ageDays = Math.floor((now.getTime() - new Date(w.createdAt).getTime()) / 86_400_000)
      const forToday = w.targetDate === today
      const overdue = w.targetDate < today
      if (forToday || overdue || ageDays >= 2) {
        const reason = overdue
          ? 'data já passou'
          : forToday
            ? 'para hoje'
            : `há ${ageDays} dias na fila`
        list.push({
          id: `waitlist:${w.id}`,
          icon: Clock,
          tone: 'info',
          title: 'Fila de espera',
          description: `${w.client.name} · ${w.service.name} · ${reason}`,
          timestamp: w.createdAt,
          onClick: () => go('/app/agenda'),
        })
      }
    }

    // 5. Aniversariantes do dia
    for (const c of clientsQuery.data ?? []) {
      if (isBirthdayToday(c.birthDate, today)) {
        list.push({
          id: `bday:${c.id}`,
          icon: Cake,
          tone: 'brand',
          title: 'Aniversário de cliente',
          description: `${c.name} faz aniversário hoje 🎉`,
          onClick: () => go(`/app/clientes/${c.id}`),
        })
      }
    }

    // 6. Custos fixos / folha vencendo ou vencidos e ainda não baixados
    for (const it of forecastQuery.data?.items ?? []) {
      if (it.posted || it.dueDate > tomorrow) continue
      const isPayroll = it.kind === 'payroll'
      list.push({
        id: `forecast:${it.id}`,
        icon: isPayroll ? Wallet : Receipt,
        tone: 'warning',
        title: isPayroll ? 'Dia de pagamento' : 'Custo fixo a pagar',
        description: `${it.description} · ${formatBRL(it.amountCents)} · vence ${formatDate(it.dueDate)}`,
        onClick: () => go('/app/financeiro'),
      })
    }

    // 7. Estoque baixo ou esgotado
    for (const p of productsQuery.data ?? []) {
      if (!p.active || p.stockQuantity > LOW_STOCK) continue
      const out = p.stockQuantity === 0
      list.push({
        id: `stock:${p.id}`,
        icon: PackageMinus,
        tone: out ? 'error' : 'warning',
        title: out ? 'Produto esgotado' : 'Estoque baixo',
        description: `${p.name} · ${p.stockQuantity} em estoque`,
        onClick: () => go('/app/estoque'),
      })
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingQuery.data,
    recentQuery.data,
    todayConfirmedQuery.data,
    waitlistQuery.data,
    clientsQuery.data,
    productsQuery.data,
    forecastQuery.data,
    canResolvePending,
    today,
    tomorrow,
    nowMin,
  ])

  const count = notifications.length
  // isLoading e não isPending: query desabilitada por falta de permissão fica
  // "pending" para sempre, e isso deixaria o spinner girando no lugar do estado
  // vazio para quem não tem nenhuma das áreas.
  const someLoading = [
    pendingQuery,
    recentQuery,
    todayConfirmedQuery,
    waitlistQuery,
    clientsQuery,
    productsQuery,
    forecastQuery,
  ].some((q) => q.isLoading)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-background"
      >
        <Bell className="h-[26px] w-[26px]" strokeWidth={1.9} />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 -mr-10 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-divider bg-surface shadow-floating sm:mr-0">
          <div className="flex items-center justify-between border-b border-line-divider px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notificações</p>
            {count > 0 && (
              <span className="text-xs font-medium text-ink-tertiary">
                {count} {count === 1 ? 'nova' : 'novas'}
              </span>
            )}
          </div>

          <div className="thin-scrollbar max-h-96 overflow-y-auto">
            {count === 0 && someLoading ? (
              <div className="flex justify-center py-8">
                <Spinner className="h-5 w-5" />
              </div>
            ) : count === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <CheckCheck className="h-6 w-6 text-ink-tertiary" strokeWidth={1.7} />
                <p className="text-sm text-ink-secondary">Tudo em dia! Nenhuma notificação.</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={n.onClick}
                  className="flex w-full items-start gap-3 border-b border-line-divider px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-hover"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      toneClasses[n.tone],
                    )}
                  >
                    <n.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-xs text-ink-secondary">{n.description}</p>
                    {n.timestamp && (
                      <p className="mt-1 text-[11px] text-ink-tertiary">{timeAgo(n.timestamp)}</p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {selected && (
        <PendingAppointmentDialog
          appointment={selected}
          onClose={() => setSelected(null)}
          onResolved={() => setSelected(null)}
        />
      )}
    </div>
  )
}
