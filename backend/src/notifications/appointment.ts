import { eq } from 'drizzle-orm'
import { db } from '../db'
import { appointments } from '../db/schema'
import { buildManageUrl } from '../lib/appointmentToken'
import { APP_URL } from '../lib/appUrl'
import { getEffectivePlan } from '../lib/plan'
import { planHasFeature } from '../lib/plans'
import { notify } from './dispatcher'

/**
 * Ponto único que monta e dispara as notificações de um agendamento para o
 * CLIENTE FINAL. Existe para que os três produtores (booking público, criação
 * pelo painel e cancelamento pela página de gerenciamento) não repitam a
 * montagem dos parâmetros nem esqueçam de checar o opt-out.
 */

type AppointmentNotificationType =
  | 'appointment_confirmed'
  | 'appointment_reminder'
  | 'appointment_cancelled'

export interface AppointmentNotificationInput {
  appointmentId: string
  date: string
  startTime: string
  /** 'pending' muda o texto para "pedido recebido, aguarde confirmação". */
  pending?: boolean
  client: { name: string; phone: string; email?: string | null; whatsappOptOut?: boolean }
  service: { name: string; priceCents: number }
  employee: { name: string }
  establishment: { id: string; name: string; slug: string }
}

/**
 * Fire-and-forget: use com `void`. Nunca rejeita (o `notify` é best-effort),
 * então uma fila fora do ar nunca falha o agendamento.
 */
export async function notifyAppointment(
  type: AppointmentNotificationType,
  input: AppointmentNotificationInput,
): Promise<void> {
  const { client, service, employee, establishment } = input

  // WhatsApp é recurso de plano (Essencial e Profissional, e o teste grátis, que
  // roda como Essencial). No Básico o agendamento acontece igual e o e-mail
  // continua saindo: só o canal WhatsApp fica de fora.
  const plan = await getEffectivePlan(establishment.id).catch(() => 'free')
  const canWhatsApp = planHasFeature(plan, 'whatsapp')

  await notify(
    type,
    {
      // Opt-out (LGPD) silencia o WhatsApp, mas não o e-mail: são consentimentos
      // distintos e o cliente descadastrou só as mensagens.
      phone: canWhatsApp && !client.whatsappOptOut ? client.phone : null,
      email: client.email || null,
    },
    {
      appointmentId: input.appointmentId,
      clientName: client.name,
      establishmentName: establishment.name,
      serviceName: service.name,
      employeeName: employee.name,
      date: input.date,
      startTime: input.startTime,
      priceCents: service.priceCents,
      manageUrl: buildManageUrl(APP_URL, establishment.slug, input.appointmentId),
      pending: input.pending,
    },
    // A data entra na chave para que remarcar dispare uma confirmação nova em
    // vez de ser descartada como duplicata do agendamento original.
    { key: `${type}:${input.appointmentId}:${input.date}:${input.startTime}` },
  )
}

/**
 * Mesma coisa, mas buscando os dados pelo id. Para os produtores que não têm o
 * agendamento montado em mãos (criação pelo painel, cancelamento/remarcação na
 * página pública). Silenciosa: um agendamento sumido não pode derrubar quem
 * chamou em fire-and-forget.
 */
export async function notifyAppointmentById(
  type: AppointmentNotificationType,
  appointmentId: string,
): Promise<void> {
  const row = await db.query.appointments.findFirst({
    where: eq(appointments.id, appointmentId),
    columns: { id: true, date: true, startTime: true, status: true },
    with: {
      client: { columns: { name: true, phone: true, email: true, whatsappOptOut: true } },
      service: { columns: { name: true, priceCents: true } },
      employee: { columns: { name: true } },
      establishment: { columns: { id: true, name: true, slug: true } },
    },
  })
  if (!row) return

  await notifyAppointment(type, {
    appointmentId: row.id,
    date: row.date,
    startTime: row.startTime,
    pending: row.status === 'pending',
    client: row.client,
    service: row.service,
    employee: row.employee,
    establishment: row.establishment,
  })
}
