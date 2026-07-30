import type { LucideIcon } from 'lucide-react'
import { BellRing, CalendarCheck, CalendarCog, MessageCircle } from 'lucide-react'
import { SlideShell } from '../SlideShell'

const MESSAGES: { title: string; text: string; when: string }[] = [
  {
    when: 'Na hora do agendamento',
    title: 'Confirmação',
    text: 'Agendamento confirmado! Corte + Barba com o Carlos, quinta às 15:00. Qualquer coisa é só responder.',
  },
  {
    when: 'Um dia antes',
    title: 'Lembrete de véspera',
    text: 'Oi, Marcos! Passando para lembrar do seu horário amanhã às 15:00. Até lá!',
  },
]

const EXTRAS: { icon: LucideIcon; text: string }[] = [
  { icon: CalendarCog, text: 'O cliente cancela ou remarca pelo próprio link, sem te ligar.' },
  { icon: CalendarCheck, text: 'O horário liberado volta na hora para quem quiser agendar.' },
  { icon: BellRing, text: 'Você é avisado no painel a cada novo agendamento.' },
]

export function NotificationsSlide() {
  return (
    <SlideShell
      eyebrow="WhatsApp automático"
      title="Cadeira vazia é prejuízo. O lembrete evita boa parte delas."
      description="O cliente recebe a confirmação na hora e um lembrete na véspera, sem você digitar nada. Se não puder vir, ele mesmo remarca e o horário volta a ficar livre."
    >
      <div className="grid w-full max-w-4xl items-start gap-4 text-left lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <ul className="flex flex-col gap-3">
          {MESSAGES.map((message) => (
            <li key={message.title} className="rounded-xl bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-light text-success-dark">
                  <MessageCircle className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{message.title}</p>
                  <p className="truncate text-[11px] uppercase tracking-wide text-ink-tertiary">
                    {message.when}
                  </p>
                </div>
              </div>
              <p className="mt-2.5 rounded-xl rounded-tl-none bg-success-light px-3 py-2 text-[13px] leading-relaxed text-success-dark">
                {message.text}
              </p>
            </li>
          ))}
        </ul>

        <ul className="flex flex-col justify-center gap-3">
          {EXTRAS.map((extra) => (
            <li key={extra.text} className="flex items-start gap-3 rounded-xl bg-surface p-4 shadow-card">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary-light text-primary">
                <extra.icon className="h-4 w-4" />
              </span>
              <p className="text-[13px] leading-relaxed text-ink-secondary">{extra.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </SlideShell>
  )
}
