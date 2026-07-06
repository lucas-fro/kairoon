import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  Bell,
  Cake,
  CalendarClock,
  CheckCheck,
  Clock,
  PackageMinus,
  Receipt,
  Wallet,
} from 'lucide-react'
import { listAppointments } from '../../api/appointments'
import { listClients } from '../../api/clients'
import { listProducts } from '../../api/products'
import { getRecurringExpensesForecast } from '../../api/recurringExpenses'
import { listWaitlist } from '../../api/waitlist'
import { addDays, timeToMinutes, todayStr } from '../../lib/dates'
import { cn, formatBRL, formatDate } from '../../lib/format'
import { useDropdown } from '../../hooks/useDropdown'
import { PendingAppointmentDialog, toPendingView } from '../realtime/PendingAppointmentDialog'
import type { PendingAppointmentView } from '../realtime/PendingAppointmentDialog'
import { Spinner } from '../ui/Spinner'

const LOW_STOCK = 5

type Tone = 'warning' | 'info' | 'error' | 'success' | 'brand'

const toneClasses: Record<Tone, string> = {
  warning: 'bg-warning-light text-warning-dark',
  info: 'bg-secondary-light text-primary',
  error: 'bg-error-light text-error-dark',
  success: 'bg-success-light text-success-dark',
  brand: 'bg-primary/10 text-primary',
}

interface NotificationItem {
  id: string
  icon: LucideIcon
  tone: Tone
  title: string
  description: string
  onClick: () => void
}

function isBirthdayToday(birthDate: string | null, today: string): boolean {
  if (!birthDate || birthDate.length < 10) return false
  return birthDate.slice(5, 10) === today.slice(5, 10)
}

export function NotificationsBell() {
  const { open, setOpen, ref } = useDropdown()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<PendingAppointmentView | null>(null)

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
  })
  // Atendimentos de hoje já confirmados (para achar os que passaram e não fecharam)
  const todayConfirmedQuery = useQuery({
    queryKey: ['appointments', 'notif-today', today],
    queryFn: () => listAppointments({ start: today, end: today, status: 'confirmed' }),
    refetchInterval: 60000,
  })
  const waitlistQuery = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => listWaitlist({ status: 'waiting' }),
    refetchInterval: 60000,
  })
  const clientsQuery = useQuery({
    queryKey: ['clients', ''],
    queryFn: () => listClients(),
    refetchInterval: 300000,
  })
  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => listProducts(),
    refetchInterval: 300000,
  })
  const forecastQuery = useQuery({
    queryKey: ['recurring-expenses', 'forecast', month],
    queryFn: () => getRecurringExpensesForecast(month),
    refetchInterval: 300000,
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
        onClick: () => {
          setSelected(toPendingView(a))
          setOpen(false)
        },
      })
    }

    // 2. Atendimentos de hoje que já passaram e não foram fechados
    for (const a of todayConfirmedQuery.data ?? []) {
      if (timeToMinutes(a.endTime) <= nowMin) {
        list.push({
          id: `unclosed:${a.id}`,
          icon: AlertTriangle,
          tone: 'error',
          title: 'Atendimento não fechado',
          description: `${a.client.name} · ${a.startTime} — conclua ou remarque`,
          onClick: () => go('/app/agenda'),
        })
      }
    }

    // 3. Fila de espera: para hoje, vencida, ou esperando há muito tempo
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
          onClick: () => go('/app/agenda'),
        })
      }
    }

    // 4. Aniversariantes do dia
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

    // 5. Custos fixos / folha vencendo ou vencidos e ainda não baixados
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

    // 6. Estoque baixo ou esgotado
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
    todayConfirmedQuery.data,
    waitlistQuery.data,
    clientsQuery.data,
    productsQuery.data,
    forecastQuery.data,
    today,
    tomorrow,
    nowMin,
  ])

  const count = notifications.length
  const someLoading = [
    pendingQuery,
    todayConfirmedQuery,
    waitlistQuery,
    clientsQuery,
    productsQuery,
    forecastQuery,
  ].some((q) => q.isPending)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notificações"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-background"
      >
        <Bell className="h-[22px] w-[22px]" strokeWidth={1.9} />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-error px-1 text-[10px] font-semibold leading-none text-white">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line-divider bg-surface shadow-floating">
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
