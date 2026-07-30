import { useMemo, useReducer } from 'react'
import type { CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import { addDays, todayStr } from '../../lib/dates'
import { cn } from '../../lib/format'
import type { Palette } from '../../lib/palettes'
import { paletteToVars } from '../../lib/palettes'
import { ClientStep } from '../booking/ClientStep'
import { ConfirmStep } from '../booking/ConfirmStep'
import { DateStep } from '../booking/DateStep'
import { EmployeeStep } from '../booking/EmployeeStep'
import { ServiceStep } from '../booking/ServiceStep'
import { StepShell } from '../booking/StepShell'
import { SuccessStep } from '../booking/SuccessStep'
import { TimeStep } from '../booking/TimeStep'
import { WelcomeStep } from '../booking/WelcomeStep'
import type { PublicEmployee, PublicService, WizardStep } from '../booking/types'
import {
  DEMO_BRANDING,
  DEMO_EMPLOYEES,
  DEMO_ESTABLISHMENT,
  DEMO_SERVICES,
  DEMO_SLOTS,
  DEMO_WORKING_HOURS,
  demoBookingResult,
} from './demoData'

interface MockState {
  step: WizardStep
  service: PublicService | null
  employee: PublicEmployee | null
  date: string | null
  time: string | null
  clientName: string
  clientPhone: string
}

type MockAction =
  | { type: 'start' }
  | { type: 'service'; service: PublicService }
  | { type: 'employee'; employee: PublicEmployee }
  | { type: 'date'; date: string }
  | { type: 'time'; time: string }
  | { type: 'client'; name: string; phone: string }
  | { type: 'confirm' }
  | { type: 'back'; to: WizardStep }
  | { type: 'reset' }

const INITIAL: MockState = {
  step: 'welcome',
  service: null,
  employee: null,
  date: null,
  time: null,
  clientName: '',
  clientPhone: '',
}

function reducer(state: MockState, action: MockAction): MockState {
  switch (action.type) {
    case 'start':
      return { ...state, step: 'service' }
    case 'service':
      return { ...state, service: action.service, step: 'employee' }
    case 'employee':
      return { ...state, employee: action.employee, step: 'date' }
    case 'date':
      return { ...state, date: action.date, time: null, step: 'time' }
    case 'time':
      return { ...state, time: action.time, step: 'client' }
    case 'client':
      return { ...state, clientName: action.name, clientPhone: action.phone, step: 'confirm' }
    case 'confirm':
      return { ...state, step: 'success' }
    case 'back':
      return { ...state, step: action.to }
    case 'reset':
      return INITIAL
  }
}

/** Título e passo de retorno de cada etapa (o welcome e o sucesso não têm). */
const STEP_META: Partial<Record<WizardStep, { title: string; back: WizardStep }>> = {
  service: { title: 'Escolha o serviço', back: 'welcome' },
  employee: { title: 'Escolha o profissional', back: 'service' },
  date: { title: 'Escolha o dia', back: 'employee' },
  time: { title: 'Escolha o horário', back: 'date' },
  client: { title: 'Seus dados', back: 'time' },
  confirm: { title: 'Confirme o agendamento', back: 'client' },
}

const ORDER: WizardStep[] = ['service', 'employee', 'date', 'time', 'client', 'confirm']

interface BookingMockProps {
  /** Paleta aplicada ao mock inteiro (o slide de personalização troca ao vivo). */
  palette: Palette
  /** Avisa o slide na primeira interação (para trocar a dica). */
  onInteract?: () => void
  /** Avisa o slide quando o agendamento fictício é confirmado. */
  onComplete?: () => void
  className?: string
}

/**
 * O link público de agendamento rodando de verdade dentro da apresentação:
 * escolher serviço, profissional, dia, horário, preencher os dados e confirmar.
 * Usa os mesmos componentes do fluxo real (`WelcomeStep`, `ServiceStep`,
 * `EmployeeStep`, `DateStep`, `TimeStep`, `ClientStep`, `ConfirmStep` e
 * `SuccessStep`) com dados fictícios, então a demonstração acompanha o produto
 * sozinha em vez de virar uma captura de tela que envelhece.
 */
export function BookingMock({ palette, onInteract, onComplete, className }: BookingMockProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL)
  const defaultDate = useMemo(() => addDays(todayStr(), 1), [])

  const branding = { ...DEMO_BRANDING, brandColor: palette.primary }
  const style = { ...paletteToVars(palette), '--brand': palette.primary } as CSSProperties

  const meta = STEP_META[state.step]
  const isWelcome = state.step === 'welcome'
  const isSuccess = state.step === 'success'
  const progress = meta ? ((ORDER.indexOf(state.step) + 1) / (ORDER.length + 1)) * 100 : 100

  function begin(service: PublicService | null) {
    onInteract?.()
    dispatch(service ? { type: 'service', service } : { type: 'start' })
  }

  return (
    <div style={style} className={cn('flex flex-col overflow-hidden bg-background', className)}>
      {/* Barra do navegador: lembra que isso é um link, não um aplicativo. */}
      <div className="flex shrink-0 items-center justify-center bg-ink px-3 py-2">
        <span className="truncate rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/70">
          kairoon.com.br/seu-negocio
        </span>
      </div>

      {/* Cabeçalho das etapas internas, igual ao do link real. */}
      {!isWelcome && !isSuccess && (
        <header className="shrink-0 bg-surface shadow-card">
          <div className="flex items-center gap-3 px-4 py-3">
            <img
              src={DEMO_ESTABLISHMENT.logoUrl ?? '/logo.svg'}
              alt=""
              className="h-8 w-8 shrink-0 rounded-xl object-cover"
            />
            <p className="min-w-0 truncate font-display text-sm font-semibold text-ink">
              {DEMO_ESTABLISHMENT.name}
            </p>
          </div>
          <div className="h-1 w-full bg-line-divider">
            <div
              className="h-full transition-all duration-200"
              style={{ width: `${progress}%`, backgroundColor: 'var(--brand)' }}
            />
          </div>
        </header>
      )}

      <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {isWelcome && (
          <WelcomeStep
            compact
            establishment={DEMO_ESTABLISHMENT}
            branding={branding}
            services={DEMO_SERVICES}
            socialLinks={[]}
            onStart={() => begin(null)}
            onPickService={(service) => begin(service)}
          />
        )}

        {isSuccess && state.service && state.employee && state.date && state.time && (
          <div className="flex min-h-0 flex-1 flex-col">
            <SuccessStep
              hideManageLink
              establishment={DEMO_ESTABLISHMENT}
              branding={branding}
              result={demoBookingResult({
                service: state.service,
                employee: state.employee,
                date: state.date,
                startTime: state.time,
                clientName: state.clientName,
                clientPhone: state.clientPhone,
              })}
            />
            <div className="shrink-0 px-5 pb-5 pt-3">
              <button
                type="button"
                onClick={() => dispatch({ type: 'reset' })}
                className="mx-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-secondary transition-colors duration-150 hover:bg-surface hover:text-ink"
              >
                <RotateCcw className="h-4 w-4" />
                Ver o fluxo de novo
              </button>
            </div>
          </div>
        )}

        {meta && (
          <div className="px-4">
            <StepShell title={meta.title} onBack={() => dispatch({ type: 'back', to: meta.back })}>
              {state.step === 'service' && (
                <ServiceStep
                  services={DEMO_SERVICES}
                  onSelect={(service) => dispatch({ type: 'service', service })}
                />
              )}

              {state.step === 'employee' && (
                <EmployeeStep
                  employees={DEMO_EMPLOYEES}
                  onSelect={(employee) => dispatch({ type: 'employee', employee })}
                />
              )}

              {state.step === 'date' && (
                <DateStep
                  selected={state.date}
                  workingHours={DEMO_WORKING_HOURS}
                  onSelect={(date) => dispatch({ type: 'date', date })}
                />
              )}

              {state.step === 'time' && state.service && (
                <TimeStep
                  slug={DEMO_ESTABLISHMENT.slug}
                  serviceId={state.service.id}
                  employeeId={state.employee?.id}
                  date={state.date ?? defaultDate}
                  loadSlots={async () => ({ slots: DEMO_SLOTS })}
                  onSelect={(time) => dispatch({ type: 'time', time })}
                  onPickAnotherDate={() => dispatch({ type: 'back', to: 'date' })}
                />
              )}

              {state.step === 'client' && (
                <ClientStep
                  slug={DEMO_ESTABLISHMENT.slug}
                  initialName={state.clientName}
                  initialPhone={state.clientPhone}
                  initialEmail=""
                  initialBirthDate=""
                  initialGender=""
                  // Sem API na apresentação: todo telefone entra como cliente novo.
                  identify={async () => ({ client: null })}
                  onContinue={(name, phone) => dispatch({ type: 'client', name, phone })}
                />
              )}

              {state.step === 'confirm' && state.service && state.employee && state.date && state.time && (
                <ConfirmStep
                  slug={DEMO_ESTABLISHMENT.slug}
                  establishmentName={DEMO_ESTABLISHMENT.name}
                  service={state.service}
                  employee={state.employee}
                  date={state.date}
                  startTime={state.time}
                  clientName={state.clientName}
                  clientPhone={state.clientPhone}
                  clientEmail=""
                  clientBirthDate=""
                  clientGender=""
                  submit={async () =>
                    demoBookingResult({
                      service: state.service!,
                      employee: state.employee!,
                      date: state.date!,
                      startTime: state.time!,
                      clientName: state.clientName,
                      clientPhone: state.clientPhone,
                    })
                  }
                  onSuccess={() => {
                    dispatch({ type: 'confirm' })
                    onComplete?.()
                  }}
                  onSlotTaken={() => dispatch({ type: 'back', to: 'time' })}
                />
              )}
            </StepShell>
          </div>
        )}
      </div>
    </div>
  )
}
