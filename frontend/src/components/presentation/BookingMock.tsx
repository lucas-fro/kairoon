import { useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { CalendarCheck, CheckCircle2, RotateCcw } from 'lucide-react'
import { addDays, todayStr } from '../../lib/dates'
import { formatBRL, formatDateLong } from '../../lib/format'
import type { Palette } from '../../lib/palettes'
import { paletteToVars } from '../../lib/palettes'
import { StepShell } from '../booking/StepShell'
import { TimeStep } from '../booking/TimeStep'
import { WelcomeStep } from '../booking/WelcomeStep'
import type { PublicService } from '../booking/types'
import { Button } from '../ui/Button'
import { PhoneFrame } from './PhoneFrame'
import {
  DEMO_BRANDING,
  DEMO_EMPLOYEE_NAME,
  DEMO_ESTABLISHMENT,
  DEMO_SERVICES,
  DEMO_SLOTS,
} from './demoData'

type MockStep = 'welcome' | 'time' | 'done'

interface BookingMockProps {
  /** Paleta aplicada ao mock inteiro (slide de personalização troca em tempo real). */
  palette: Palette
  /** Avisa o slide na primeira interação (para esconder a dica). */
  onInteract?: () => void
  /** Avisa o slide quando o agendamento fictício chega ao fim. */
  onComplete?: () => void
  className?: string
}

/**
 * O link público de agendamento rodando dentro de uma moldura de celular.
 * Usa os componentes reais do fluxo (`WelcomeStep`, `TimeStep`) com dados
 * fictícios, então o que aparece na apresentação é o produto de verdade e não
 * uma captura de tela que envelhece.
 */
export function BookingMock({ palette, onInteract, onComplete, className }: BookingMockProps) {
  const [step, setStep] = useState<MockStep>('welcome')
  const [service, setService] = useState<PublicService | null>(null)
  const [time, setTime] = useState<string | null>(null)
  const date = useMemo(() => addDays(todayStr(), 1), [])

  const branding = { ...DEMO_BRANDING, brandColor: palette.primary }
  const style = { ...paletteToVars(palette), '--brand': palette.primary } as CSSProperties

  function start(picked: PublicService | null) {
    onInteract?.()
    setService(picked ?? DEMO_SERVICES[0])
    setStep('time')
  }

  function reset() {
    setStep('welcome')
    setService(null)
    setTime(null)
  }

  return (
    <PhoneFrame url="kairoon.com.br/seu-negocio" className={className}>
      <div style={style} className="flex min-h-full flex-col">
        {step === 'welcome' && (
          <WelcomeStep
            compact
            establishment={DEMO_ESTABLISHMENT}
            branding={branding}
            services={DEMO_SERVICES}
            socialLinks={[]}
            onStart={() => start(null)}
            onPickService={(picked) => start(picked)}
          />
        )}

        {step === 'time' && service && (
          <div className="px-4">
            <StepShell title="Escolha o horário" onBack={reset}>
              <TimeStep
                slug={DEMO_ESTABLISHMENT.slug}
                serviceId={service.id}
                date={date}
                loadSlots={async () => ({ slots: DEMO_SLOTS })}
                onSelect={(picked) => {
                  setTime(picked)
                  setStep('done')
                  onComplete?.()
                }}
                onPickAnotherDate={reset}
              />
            </StepShell>
          </div>
        )}

        {step === 'done' && service && time && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
            <CheckCircle2 className="h-12 w-12 text-success" />
            <div>
              <p className="font-display text-lg font-semibold text-ink">Horário confirmado</p>
              <p className="mt-1 text-[13px] text-ink-secondary">
                O cliente recebe a confirmação no WhatsApp e um lembrete na véspera.
              </p>
            </div>
            <dl className="w-full space-y-2 rounded-xl bg-background p-4 text-left text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Serviço</dt>
                <dd className="font-medium text-ink">{service.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Profissional</dt>
                <dd className="font-medium text-ink">{DEMO_EMPLOYEE_NAME}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-secondary">Quando</dt>
                <dd className="text-right font-medium text-ink first-letter:uppercase">
                  {formatDateLong(date)}, {time}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line-divider pt-2">
                <dt className="text-ink-secondary">Valor</dt>
                <dd className="font-display font-semibold text-primary">
                  {formatBRL(service.priceCents)}
                </dd>
              </div>
            </dl>
            <p className="flex items-center gap-1.5 text-xs text-ink-tertiary">
              <CalendarCheck className="h-3.5 w-3.5" />
              Já entrou na sua agenda, sem você fazer nada
            </p>
            <Button variant="outline" size="sm" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
              Ver de novo
            </Button>
          </div>
        )}
      </div>
    </PhoneFrame>
  )
}
