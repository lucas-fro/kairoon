import { useEffect, useReducer, useState } from 'react'
import type { CSSProperties } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertCircle,
  BellOff,
  CalendarCheck2,
  CalendarX2,
  CheckCircle2,
  Clock,
  MessageSquare,
  Scissors,
  SearchX,
  User,
} from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { getPublicEstablishment } from '../../api/public'
import {
  cancelManagedAppointment,
  getManagedAppointment,
  getRescheduleAvailability,
  optOutOfWhatsApp,
  requestAccessCode,
  rescheduleManagedAppointment,
  verifyAccessCode,
} from '../../api/publicManage'
import { DateStep } from '../../components/booking/DateStep'
import { TimeStep } from '../../components/booking/TimeStep'
import { StepShell } from '../../components/booking/StepShell'
import { KairoonMark } from '../../components/brand/Logo'
import { Button } from '../../components/ui/Button'
import { Card, CardContent } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Input } from '../../components/ui/Input'
import { PageLoader } from '../../components/ui/Spinner'
import { cn, formatBRL, formatDateLong, formatPhone, isValidPhone } from '../../lib/format'
import { paletteToVars, resolvePalette } from '../../lib/palettes'
import type { ManagedAppointment } from '../../types/api'

/**
 * Página pública de cancelar/remarcar (`/:slug/editagendamento`).
 *
 * Dois caminhos de entrada, um só modelo de autorização (o token do
 * agendamento, ver backend/src/lib/appointmentToken.ts):
 *  - com `?t=<token>`: o link do WhatsApp/e-mail abre direto no agendamento;
 *  - sem token: o cliente digita o telefone, recebe um código de 6 dígitos no
 *    WhatsApp e, ao verificar, recebe os tokens dos seus agendamentos futuros.
 */

type Step =
  | 'phone' // pedir telefone
  | 'code' // digitar o código de 6 dígitos
  | 'pick' // escolher entre vários agendamentos futuros
  | 'detail' // ver o agendamento e decidir
  | 'date' // remarcar: escolher o dia
  | 'time' // remarcar: escolher a hora
  | 'done' // cancelado/remarcado com sucesso

interface State {
  step: Step
  phone: string
  code: string
  /** Agendamentos devolvidos pela verificação por código. */
  options: ManagedAppointment[]
  current: ManagedAppointment | null
  newDate: string | null
  /** Mensagem da tela final. */
  outcome: 'cancelled' | 'rescheduled' | null
}

const initialState: State = {
  step: 'phone',
  phone: '',
  code: '',
  options: [],
  current: null,
  newDate: null,
  outcome: null,
}

type Action =
  | { type: 'setPhone'; phone: string }
  | { type: 'setCode'; code: string }
  | { type: 'codeSent' }
  | { type: 'verified'; appointments: ManagedAppointment[] }
  | { type: 'select'; appointment: ManagedAppointment }
  | { type: 'startReschedule' }
  | { type: 'pickDate'; date: string }
  | { type: 'back'; to: Step }
  | { type: 'finished'; appointment: ManagedAppointment; outcome: 'cancelled' | 'rescheduled' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setPhone':
      return { ...state, phone: action.phone }
    case 'setCode':
      return { ...state, code: action.code }
    case 'codeSent':
      return { ...state, step: 'code', code: '' }
    case 'verified':
      // Um único agendamento não merece uma tela de escolha: vai direto.
      return action.appointments.length === 1
        ? { ...state, options: action.appointments, current: action.appointments[0], step: 'detail' }
        : { ...state, options: action.appointments, step: 'pick' }
    case 'select':
      return { ...state, current: action.appointment, step: 'detail' }
    case 'startReschedule':
      return { ...state, step: 'date', newDate: null }
    case 'pickDate':
      return { ...state, newDate: action.date, step: 'time' }
    case 'back':
      return { ...state, step: action.to }
    case 'finished':
      return { ...state, current: action.appointment, outcome: action.outcome, step: 'done' }
  }
}

const STEP_TITLES: Partial<Record<Step, string>> = {
  phone: 'Meu agendamento',
  code: 'Confirme o código',
  pick: 'Qual agendamento?',
  detail: 'Seu agendamento',
  date: 'Escolha a nova data',
  time: 'Escolha o novo horário',
}

/** Linha rótulo + valor do resumo do agendamento. */
function SummaryRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
      <div className="min-w-0">
        <p className="text-xs text-ink-tertiary">{label}</p>
        <p className="text-sm font-medium text-ink first-letter:uppercase">{value}</p>
      </div>
    </div>
  )
}

function AppointmentSummary({ appointment }: { appointment: ManagedAppointment }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <SummaryRow icon={CalendarCheck2} label="Data" value={formatDateLong(appointment.date)} />
        <SummaryRow
          icon={Clock}
          label="Horário"
          value={`${appointment.startTime} às ${appointment.endTime}`}
        />
        <SummaryRow icon={Scissors} label="Serviço" value={appointment.service.name} />
        <SummaryRow icon={User} label="Profissional" value={appointment.employee.name} />
        <div className="flex items-center justify-between border-t border-line-divider pt-3">
          <span className="text-sm text-ink-secondary">Valor</span>
          <span className="font-display text-base font-semibold text-primary">
            {formatBRL(appointment.service.priceCents)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function PublicManageBookingPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const linkToken = searchParams.get('t')

  const [state, dispatch] = useReducer(reducer, initialState)
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [optedOut, setOptedOut] = useState(false)

  // Branding/tema e horários de funcionamento vêm do mesmo endpoint do link
  // público: a página de gerenciamento é a mesma marca, não uma tela avulsa.
  const establishmentQuery = useQuery({
    queryKey: ['public', slug],
    queryFn: () => getPublicEstablishment(slug),
    enabled: slug.length > 0,
    staleTime: 5 * 60_000,
  })

  // Caminho do link: resolve o agendamento direto pelo token da URL.
  const linkQuery = useQuery({
    queryKey: ['manage-appointment', slug, linkToken],
    queryFn: () => getManagedAppointment(slug, linkToken as string),
    enabled: Boolean(slug && linkToken),
    retry: false,
  })

  useEffect(() => {
    if (linkQuery.data) dispatch({ type: 'select', appointment: linkQuery.data.appointment })
  }, [linkQuery.data])

  useEffect(() => {
    const name = establishmentQuery.data?.establishment.name
    if (name) document.title = `${name} · Meu agendamento`
  }, [establishmentQuery.data])

  const requestCodeMutation = useMutation({
    mutationFn: () => requestAccessCode(slug, state.phone),
    onSuccess: () => {
      setFormError(null)
      dispatch({ type: 'codeSent' })
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Tente novamente'),
  })

  const verifyMutation = useMutation({
    mutationFn: () => verifyAccessCode(slug, state.phone, state.code),
    onSuccess: (result) => {
      setFormError(null)
      if (result.appointments.length === 0) {
        setFormError('Você não tem agendamentos futuros neste estabelecimento.')
        return
      }
      dispatch({ type: 'verified', appointments: result.appointments })
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Código inválido'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelManagedAppointment(slug, state.current?.token ?? ''),
    onSuccess: (result) => {
      setConfirmingCancel(false)
      dispatch({ type: 'finished', appointment: result.appointment, outcome: 'cancelled' })
    },
    onError: (err) => {
      setConfirmingCancel(false)
      setFormError(err instanceof Error ? err.message : 'Não foi possível cancelar')
    },
  })

  const rescheduleMutation = useMutation({
    mutationFn: (startTime: string) =>
      rescheduleManagedAppointment(slug, state.current?.token ?? '', {
        date: state.newDate as string,
        startTime,
      }),
    onSuccess: (result) => {
      setFormError(null)
      dispatch({ type: 'finished', appointment: result.appointment, outcome: 'rescheduled' })
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Não foi possível remarcar'),
  })

  const optOutMutation = useMutation({
    mutationFn: () => optOutOfWhatsApp(slug, state.current?.token ?? ''),
    onSuccess: () => setOptedOut(true),
  })

  if (establishmentQuery.isLoading || (linkToken && linkQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Carregando…" />
      </div>
    )
  }

  if (establishmentQuery.isError || !establishmentQuery.data) {
    const notFound =
      establishmentQuery.error instanceof ApiError && establishmentQuery.error.status === 404
    return (
      <CenteredMessage
        icon={notFound ? SearchX : AlertCircle}
        title={notFound ? 'Link não encontrado' : 'Algo deu errado'}
        description={
          notFound
            ? 'Confira se o endereço está correto ou peça um novo link ao estabelecimento.'
            : 'Não foi possível carregar a página.'
        }
      />
    )
  }

  const { establishment, branding, workingHours } = establishmentQuery.data

  // Token na URL que não resolve: link adulterado, agendamento apagado ou de
  // outro estabelecimento. Oferece o caminho por telefone em vez de um beco sem
  // saída.
  const linkFailed = Boolean(linkToken) && linkQuery.isError

  const palette = resolvePalette(branding.palette, branding.brandColor)
  const brandStyle = {
    '--brand': branding.brandColor,
    ...(palette ? paletteToVars(palette) : {}),
  } as CSSProperties

  const title = STEP_TITLES[state.step]

  const backTargets: Partial<Record<Step, Step>> = {
    code: 'phone',
    // Com token no link não há de onde voltar: o detalhe é a primeira tela.
    detail: state.options.length > 1 ? 'pick' : undefined,
    date: 'detail',
    time: 'date',
  } as Partial<Record<Step, Step>>
  const backTarget = backTargets[state.step]

  function renderStep() {
    switch (state.step) {
      case 'phone':
        return (
          <div className="space-y-4">
            {linkFailed && (
              <p className="rounded-lg bg-warning-light px-3 py-2 text-sm text-ink-secondary">
                Este link não é mais válido. Informe seu telefone para localizar seu agendamento.
              </p>
            )}
            <p className="text-sm text-ink-secondary">
              Informe o telefone usado no agendamento. Enviaremos um código pelo WhatsApp para
              confirmar que é você.
            </p>
            <Input
              label="Telefone"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={state.phone}
              error={formError ?? undefined}
              onChange={(e) => {
                setFormError(null)
                dispatch({ type: 'setPhone', phone: formatPhone(e.target.value) })
              }}
            />
            <Button
              className="w-full"
              size="lg"
              disabled={!isValidPhone(state.phone)}
              isLoading={requestCodeMutation.isPending}
              onClick={() => requestCodeMutation.mutate()}
            >
              Enviar código
            </Button>
          </div>
        )

      case 'code':
        return (
          <div className="space-y-4">
            <p className="text-sm text-ink-secondary">
              Se houver um agendamento no número <strong>{state.phone}</strong>, você receberá um
              código de 6 dígitos no WhatsApp. Ele vale por 10 minutos.
            </p>
            <Input
              label="Código"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em]"
              value={state.code}
              error={formError ?? undefined}
              onChange={(e) => {
                setFormError(null)
                dispatch({ type: 'setCode', code: e.target.value.replace(/\D/g, '').slice(0, 6) })
              }}
            />
            <Button
              className="w-full"
              size="lg"
              disabled={state.code.length !== 6}
              isLoading={verifyMutation.isPending}
              onClick={() => verifyMutation.mutate()}
            >
              Confirmar
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              isLoading={requestCodeMutation.isPending}
              onClick={() => requestCodeMutation.mutate()}
            >
              Reenviar código
            </Button>
          </div>
        )

      case 'pick':
        return (
          <div className="space-y-3">
            <p className="text-sm text-ink-secondary">
              Você tem mais de um agendamento. Escolha qual deseja alterar.
            </p>
            {state.options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => dispatch({ type: 'select', appointment: option })}
                className="w-full rounded-xl border border-line bg-surface p-4 text-left transition-colors duration-150 hover:border-secondary"
              >
                <p className="text-sm font-medium text-ink first-letter:uppercase">
                  {formatDateLong(option.date)} às {option.startTime}
                </p>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  {option.service.name} com {option.employee.name}
                </p>
              </button>
            ))}
          </div>
        )

      case 'detail': {
        const appointment = state.current
        if (!appointment) return null
        return (
          <div className="space-y-4">
            <AppointmentSummary appointment={appointment} />

            {appointment.canChange ? (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => dispatch({ type: 'startReschedule' })}
                >
                  Remarcar
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  size="lg"
                  onClick={() => setConfirmingCancel(true)}
                >
                  Cancelar agendamento
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-surface px-3 py-3 text-center text-sm text-ink-secondary">
                {appointment.status === 'cancelled'
                  ? 'Este agendamento já foi cancelado.'
                  : appointment.status === 'completed'
                    ? 'Este atendimento já foi realizado.'
                    : `Faltam menos de 2 horas para o seu horário. Fale direto com ${establishment.name} para alterar.`}
              </p>
            )}

            {formError && <p className="text-center text-sm text-error">{formError}</p>}

            {/* Descadastro (LGPD): o cliente pode parar de receber WhatsApp sem
                precisar falar com o estabelecimento. */}
            {optedOut ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-tertiary">
                <BellOff className="h-3.5 w-3.5" />
                Você não receberá mais mensagens no WhatsApp.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => optOutMutation.mutate()}
                disabled={optOutMutation.isPending}
                className="mx-auto flex items-center gap-1.5 text-xs text-ink-tertiary underline underline-offset-2 hover:text-ink-secondary"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Não quero mais receber mensagens no WhatsApp
              </button>
            )}
          </div>
        )
      }

      case 'date':
        return (
          <DateStep
            selected={state.newDate}
            workingHours={workingHours}
            onSelect={(date) => dispatch({ type: 'pickDate', date })}
          />
        )

      case 'time': {
        const appointment = state.current
        if (!appointment || !state.newDate) return null
        return (
          <div className="space-y-4">
            <TimeStep
              slug={slug}
              // O serviço não muda ao remarcar; o backend resolve os horários
              // pelo próprio agendamento (via token), então estes dois só
              // compõem a chave de cache.
              serviceId={appointment.id}
              employeeId={appointment.employee.id}
              date={state.newDate}
              loadSlots={() => getRescheduleAvailability(slug, appointment.token, state.newDate!)}
              onSelect={(time) => rescheduleMutation.mutate(time)}
              onPickAnotherDate={() => dispatch({ type: 'back', to: 'date' })}
            />
            {rescheduleMutation.isPending && (
              <p className="text-center text-sm text-ink-secondary">Remarcando…</p>
            )}
            {formError && <p className="text-center text-sm text-error">{formError}</p>}
          </div>
        )
      }

      case 'done': {
        const appointment = state.current
        const cancelled = state.outcome === 'cancelled'
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface shadow-card">
              {cancelled ? (
                <CalendarX2 className="h-7 w-7 text-ink-tertiary" />
              ) : (
                <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--brand)' }} />
              )}
            </div>
            <h1 className="font-display text-xl font-semibold text-ink">
              {cancelled ? 'Agendamento cancelado' : 'Agendamento remarcado!'}
            </h1>
            <p className="max-w-xs text-sm text-ink-secondary">
              {cancelled
                ? `Seu horário na ${establishment.name} foi cancelado. Quando quiser, é só agendar de novo.`
                : 'Enviamos a confirmação com o novo horário pelo WhatsApp.'}
            </p>
            {!cancelled && appointment && (
              <div className="w-full max-w-xs pt-2">
                <AppointmentSummary appointment={appointment} />
              </div>
            )}
            <Button variant="outline" onClick={() => window.location.assign(`/${slug}`)}>
              {cancelled ? 'Fazer novo agendamento' : 'Voltar ao início'}
            </Button>
          </div>
        )
      }
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background" style={brandStyle}>
      <header className="sticky top-0 z-10 bg-surface/95 shadow-card backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
          {establishment.logoUrl ? (
            <img
              src={establishment.logoUrl}
              alt={establishment.name}
              className="h-9 w-9 shrink-0 rounded-xl object-cover"
            />
          ) : (
            <img src="/logo.svg" alt="Kairoon" className="h-8 w-auto shrink-0" />
          )}
          <p className="min-w-0 truncate font-display text-sm font-semibold text-ink">
            {establishment.name}
          </p>
        </div>
      </header>

      <main key={state.step} className="step-enter mx-auto flex w-full max-w-md flex-1 flex-col px-4">
        {title ? (
          <StepShell
            title={title}
            onBack={backTarget ? () => dispatch({ type: 'back', to: backTarget }) : undefined}
          >
            {renderStep()}
          </StepShell>
        ) : (
          renderStep()
        )}
      </main>

      <footer className="mx-auto w-full max-w-md px-4 pb-6 pt-5">
        {branding.footerMessage && (
          <p className="mb-2 text-center text-xs text-ink-secondary">{branding.footerMessage}</p>
        )}
        {branding.showKairoonWatermark && (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-tertiary">
            Agendamento feito pela
            <KairoonMark className="h-3.5 w-auto text-ink-tertiary" />
            Kairoon
          </p>
        )}
      </footer>

      <ConfirmDialog
        open={confirmingCancel}
        onClose={() => setConfirmingCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancelar agendamento?"
        description={
          state.current
            ? `Seu horário de ${formatDateLong(state.current.date)} às ${state.current.startTime} será liberado para outra pessoa.`
            : undefined
        }
        confirmLabel="Sim, cancelar"
        cancelLabel="Voltar"
        danger
        isLoading={cancelMutation.isPending}
      />
    </div>
  )
}

function CenteredMessage({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof AlertCircle
  title: string
  description: string
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className={cn('flex h-14 w-14 items-center justify-center rounded-xl bg-surface shadow-card')}>
        <Icon className="h-7 w-7 text-ink-tertiary" />
      </div>
      <h1 className="font-display text-xl font-semibold text-ink">{title}</h1>
      <p className="max-w-xs text-sm text-ink-secondary">{description}</p>
    </div>
  )
}
