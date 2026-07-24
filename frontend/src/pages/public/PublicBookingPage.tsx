import { useEffect, useReducer } from 'react'
import type { CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CalendarOff, SearchX } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { readableTextColor } from '../../lib/color'
import { cn } from '../../lib/format'
import { paletteToVars, resolvePalette } from '../../lib/palettes'
import { getPublicEstablishment } from '../../api/public'
import { ClientStep } from '../../components/booking/ClientStep'
import { ConfirmStep } from '../../components/booking/ConfirmStep'
import { DateStep } from '../../components/booking/DateStep'
import { EmployeeStep } from '../../components/booking/EmployeeStep'
import { ServiceStep } from '../../components/booking/ServiceStep'
import { StepShell } from '../../components/booking/StepShell'
import { SuccessStep } from '../../components/booking/SuccessStep'
import { TimeStep } from '../../components/booking/TimeStep'
import { WelcomeStep } from '../../components/booking/WelcomeStep'
import { KairoonMark } from '../../components/brand/Logo'
import type { PublicEmployee, PublicService, WizardStep } from '../../components/booking/types'
import { Button } from '../../components/ui/Button'
import { PageLoader } from '../../components/ui/Spinner'
import type { BookingResult } from '../../types/api'

interface WizardState {
  step: WizardStep
  service: PublicService | null
  employee: PublicEmployee | null
  date: string | null
  time: string | null
  clientName: string
  clientPhone: string
  clientEmail: string
  clientBirthDate: string
  clientGender: string
  result: BookingResult | null
}

type WizardAction =
  | { type: 'start' }
  | {
      type: 'selectService'
      service: PublicService
      employee: PublicEmployee | null
      skipEmployeeStep: boolean
    }
  | { type: 'selectEmployee'; employee: PublicEmployee }
  | { type: 'selectDate'; date: string }
  | { type: 'selectTime'; time: string }
  | {
      type: 'submitClient'
      name: string
      phone: string
      email: string
      birthDate: string
      gender: string
    }
  | { type: 'back'; to: WizardStep }
  | { type: 'backToTime' }
  | { type: 'succeed'; result: BookingResult }

const initialState: WizardState = {
  step: 'welcome',
  service: null,
  employee: null,
  date: null,
  time: null,
  clientName: '',
  clientPhone: '',
  clientEmail: '',
  clientBirthDate: '',
  clientGender: '',
  result: null,
}

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'start':
      return { ...state, step: 'service' }
    case 'selectService':
      return {
        ...state,
        service: action.service,
        employee: action.employee,
        time: null,
        step: action.skipEmployeeStep ? 'date' : 'employee',
      }
    case 'selectEmployee':
      return { ...state, employee: action.employee, time: null, step: 'date' }
    case 'selectDate':
      return { ...state, date: action.date, time: null, step: 'time' }
    case 'selectTime':
      return { ...state, time: action.time, step: 'client' }
    case 'submitClient':
      return {
        ...state,
        clientName: action.name,
        clientPhone: action.phone,
        clientEmail: action.email,
        clientBirthDate: action.birthDate,
        clientGender: action.gender,
        step: 'confirm',
      }
    case 'back':
      return { ...state, step: action.to }
    case 'backToTime':
      return { ...state, time: null, step: 'time' }
    case 'succeed':
      return { ...state, result: action.result, step: 'success' }
  }
}

function buildSocialLinks(
  socials: { instagram?: string; whatsapp?: string } | null,
): { name: string; url: string; icon: string; label?: string }[] {
  if (!socials) return []
  const handle = (value: string) => value.replace(/^@+/, '')
  const links: { name: string; url: string; icon: string; label?: string }[] = []
  if (socials.instagram) {
    const user = handle(socials.instagram)
    links.push({
      name: 'Instagram',
      url: `https://instagram.com/${user}`,
      icon: '/instagram.svg',
      label: `@${user}`,
    })
  }
  if (socials.whatsapp)
    links.push({
      name: 'WhatsApp',
      url: `https://wa.me/55${socials.whatsapp.replace(/\D/g, '')}`,
      icon: '/whatsapp.svg',
    })
  return links
}

const STEP_TITLES: Partial<Record<WizardStep, string>> = {
  service: 'Escolha o serviço',
  employee: 'Escolha o profissional',
  date: 'Escolha a data',
  time: 'Escolha o horário',
  client: 'Seus dados',
  confirm: 'Confirme seu agendamento',
}

export function PublicBookingPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const queryClient = useQueryClient()
  const [state, dispatch] = useReducer(wizardReducer, initialState)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['public', slug],
    queryFn: () => getPublicEstablishment(slug),
    enabled: slug.length > 0,
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (data) document.title = `${data.establishment.name} · Agendamento online`
  }, [data])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <PageLoader label="Carregando…" />
      </div>
    )
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface shadow-card">
          {notFound ? (
            <SearchX className="h-7 w-7 text-ink-tertiary" />
          ) : (
            <AlertCircle className="h-7 w-7 text-ink-tertiary" />
          )}
        </div>
        <h1 className="font-display text-xl font-semibold text-ink">
          {notFound ? 'Link não encontrado' : 'Algo deu errado'}
        </h1>
        <p className="max-w-xs text-sm text-ink-secondary">
          {notFound
            ? 'Confira se o endereço está correto ou peça um novo link ao estabelecimento.'
            : 'Não foi possível carregar a página de agendamento.'}
        </p>
        {!notFound && (
          <Button variant="outline" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        )}
      </div>
    )
  }

  const { establishment, services, employees, workingHours, branding } = data
  const socialLinks = buildSocialLinks(establishment.socials)

  // Dono com o teste grátis expirado (somente-leitura): a página não aceita
  // novos agendamentos. O bloqueio real é no backend (createPublicBooking); aqui
  // é só a UX — evita levar o cliente a um fluxo que terminaria em erro.
  if (!establishment.acceptingBookings) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface shadow-card">
          <CalendarOff className="h-7 w-7 text-ink-tertiary" />
        </div>
        <h1 className="font-display text-xl font-semibold text-ink">Agendamentos indisponíveis</h1>
        <p className="max-w-xs text-sm text-ink-secondary">
          {establishment.name} não está aceitando novos agendamentos online no momento. Se precisar,
          entre em contato diretamente.
        </p>
        {socialLinks.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center justify-center gap-3">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label ? `${social.name} ${social.label}` : social.name}
                className={cn(
                  'inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-secondary hover:bg-surface-hover',
                  social.label ? 'gap-2 px-3' : 'w-10',
                )}
              >
                <img src={social.icon} alt="" className="h-5 w-5" />
                {social.label && (
                  <span className="text-sm font-medium text-ink-secondary">{social.label}</span>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    )
  }

  const hasEmployeeStep = employees.length > 1
  const soleEmployee = employees.length === 1 ? employees[0] : null

  const orderedSteps: WizardStep[] = [
    'welcome',
    'service',
    ...(hasEmployeeStep ? (['employee'] as WizardStep[]) : []),
    'date',
    'time',
    'client',
    'confirm',
    'success',
  ]
  const stepIndex = Math.max(0, orderedSteps.indexOf(state.step))
  const progress = ((stepIndex + 1) / orderedSteps.length) * 100

  const backTargets: Partial<Record<WizardStep, WizardStep>> = {
    service: 'welcome',
    employee: 'service',
    date: hasEmployeeStep ? 'employee' : 'service',
    time: 'date',
    client: 'time',
    confirm: 'client',
  }
  const backTarget = backTargets[state.step]
  const handleBack = backTarget ? () => dispatch({ type: 'back', to: backTarget }) : undefined

  function handleSlotTaken() {
    queryClient.invalidateQueries({ queryKey: ['availability', slug] })
    dispatch({ type: 'backToTime' })
  }

  function renderStep() {
    switch (state.step) {
      case 'welcome':
        return (
          <WelcomeStep
            establishment={establishment}
            branding={branding}
            onStart={() => dispatch({ type: 'start' })}
          />
        )
      case 'service':
        return (
          <ServiceStep
            services={services}
            onSelect={(service) =>
              dispatch({
                type: 'selectService',
                service,
                employee: soleEmployee,
                skipEmployeeStep: !hasEmployeeStep,
              })
            }
          />
        )
      case 'employee':
        return (
          <EmployeeStep
            employees={employees}
            onSelect={(employee) => dispatch({ type: 'selectEmployee', employee })}
          />
        )
      case 'date':
        return (
          <DateStep
            selected={state.date}
            workingHours={workingHours}
            onSelect={(date) => dispatch({ type: 'selectDate', date })}
          />
        )
      case 'time':
        if (!state.service || !state.date) return null
        return (
          <TimeStep
            slug={slug}
            serviceId={state.service.id}
            employeeId={state.employee?.id}
            date={state.date}
            onSelect={(time) => dispatch({ type: 'selectTime', time })}
            onPickAnotherDate={() => dispatch({ type: 'back', to: 'date' })}
          />
        )
      case 'client':
        return (
          <ClientStep
            slug={slug}
            initialName={state.clientName}
            initialPhone={state.clientPhone}
            initialEmail={state.clientEmail}
            initialBirthDate={state.clientBirthDate}
            initialGender={state.clientGender}
            onContinue={(name, phone, email, birthDate, gender) =>
              dispatch({ type: 'submitClient', name, phone, email, birthDate, gender })
            }
          />
        )
      case 'confirm':
        if (!state.service || !state.date || !state.time) return null
        return (
          <ConfirmStep
            slug={slug}
            establishmentName={establishment.name}
            service={state.service}
            employee={state.employee}
            date={state.date}
            startTime={state.time}
            clientName={state.clientName}
            clientPhone={state.clientPhone}
            clientEmail={state.clientEmail}
            clientBirthDate={state.clientBirthDate}
            clientGender={state.clientGender}
            onSuccess={(result) => dispatch({ type: 'succeed', result })}
            onSlotTaken={handleSlotTaken}
          />
        )
      case 'success':
        if (!state.result) return null
        return (
          <SuccessStep result={state.result} establishment={establishment} branding={branding} />
        )
    }
  }

  const title = STEP_TITLES[state.step]
  const isBareStep = state.step === 'welcome' || state.step === 'success'

  // Paleta efetiva do link: além do `--brand` (banner/CTA de boas-vindas), injeta
  // as vars da marca (primary/secondary/accent) para tematizar o wizard inteiro
  // (calendário, horários, preços, botão de confirmar). Legado (palette null)
  // mantém só o `--brand`, deixando o resto nos defaults do sistema.
  const palette = resolvePalette(branding.palette, branding.brandColor)
  const brandStyle = {
    '--brand': branding.brandColor,
    ...(palette ? paletteToVars(palette) : {}),
  } as CSSProperties

  return (
    <div
      className={cn(
        'flex flex-col bg-background',
        // No passo final, fixa a altura na viewport para a página não rolar
        // (o miolo da confirmação rola internamente se não couber).
        state.step === 'success' ? 'h-[100dvh]' : 'min-h-screen',
      )}
      style={brandStyle}
    >
      {/* Nas telas "bare" (boas-vindas/sucesso) o banner carrega a identidade;
          nas etapas internas mantemos um header compacto para economizar altura. */}
      {!isBareStep && (
        <header className="sticky top-0 z-10 bg-surface/95 shadow-card backdrop-blur">
          <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 py-3">
            {establishment.logoUrl ? (
              <img
                src={establishment.logoUrl}
                alt={establishment.name}
                className="h-9 w-9 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-sm font-semibold"
                style={{
                  backgroundColor: branding.brandColor,
                  color: readableTextColor(branding.brandColor),
                }}
              >
                {establishment.name.charAt(0).toUpperCase()}
              </div>
            )}
            <p className="min-w-0 truncate font-display text-sm font-semibold text-ink">
              {establishment.name}
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

      <main
        key={state.step}
        className={cn(
          'step-enter mx-auto flex w-full min-h-0 max-w-md flex-1 flex-col',
          // Nos passos "bare" o banner de marca precisa encostar nas laterais e no
          // topo — o padding horizontal fica por conta de cada etapa internamente.
          !isBareStep && 'px-4',
        )}
      >
        {isBareStep || !title ? (
          renderStep()
        ) : (
          <StepShell title={title} onBack={handleBack}>
            {renderStep()}
          </StepShell>
        )}
      </main>

      <footer className="mx-auto w-full max-w-md px-4 pb-6 pt-5">
        {socialLinks.length > 0 && (
          <div className="mb-4 border-t border-line-divider pt-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noreferrer"
                  title={social.name}
                  aria-label={social.label ? `${social.name} ${social.label}` : social.name}
                  className={cn(
                    'inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface transition-colors duration-150 hover:border-secondary hover:bg-surface-hover',
                    social.label ? 'gap-2 px-3' : 'w-10',
                  )}
                >
                  <img src={social.icon} alt="" className="h-5 w-5" />
                  {social.label && (
                    <span className="text-sm font-medium text-ink-secondary">{social.label}</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
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
    </div>
  )
}
