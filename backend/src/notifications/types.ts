/**
 * Contrato entre produtor e consumidor: o job carrega `{ tipo, dados }`, NUNCA
 * HTML/texto pronto. Quem renderiza é o canal (o worker), então a regra de
 * negócio só conhece "notificar o usuário", não "mandar e-mail".
 *
 * A união discriminada faz o worker ter um `switch` exaustivo e type-safe:
 * adicionar um tipo aqui força tratá-lo lá.
 */

export type Channel = 'email' | 'whatsapp'

/** Dados de um agendamento usados nas mensagens ao cliente final. */
export interface AppointmentMsgParams {
  /** Usado pelo worker de WhatsApp para carimbar `appointments.reminderSentAt`. */
  appointmentId: string
  clientName: string
  establishmentName: string
  serviceName: string
  employeeName: string
  /** 'YYYY-MM-DD' (hora local do estabelecimento) */
  date: string
  /** 'HH:mm' */
  startTime: string
  priceCents: number
  /** Link público para cancelar/remarcar (já com o token do agendamento). */
  manageUrl: string
  /**
   * true quando o estabelecimento não confirma automaticamente: o texto muda de
   * "confirmado" para "pedido recebido, aguarde a confirmação".
   */
  pending?: boolean
}

export type NotificationParams = {
  welcome: { name: string; establishmentName?: string | null }
  password_reset: { name: string; code: string }
  /** Convite de acesso ao painel enviado pelo dono a um funcionário. */
  staff_invite: {
    name: string
    establishmentName: string
    /** Link já com o token do convite (uso único, expira). */
    inviteUrl: string
    expiresInDays: number
  }
  /** Disparada no ato do agendamento (link público ou painel). */
  appointment_confirmed: AppointmentMsgParams
  /** Lembrete da véspera (ver workers/reminder.scheduler.ts). */
  appointment_reminder: AppointmentMsgParams
  /** Cliente cancelou pela página pública de gerenciamento. */
  appointment_cancelled: AppointmentMsgParams
  /** Código de 6 dígitos do acesso sem token à página de gerenciamento. */
  manage_access_code: { establishmentName: string; code: string }
}

export type NotificationType = keyof NotificationParams

/**
 * Destinatário por canal. O plano original assumia um `to` único (e-mail), mas
 * uma confirmação de agendamento vai para um e-mail e um telefone diferentes:
 * o dispatcher só enfileira num canal se o campo daquele canal existir.
 */
export interface Recipient {
  email?: string | null
  phone?: string | null
}

/** Job da fila de e-mail: um tipo + o destinatário já resolvido para o canal. */
export type EmailJob = {
  [K in NotificationType]: { type: K; to: string; params: NotificationParams[K] }
}[NotificationType]

/** Job da fila de WhatsApp (mesmo formato; `to` é o telefone). */
export type WhatsAppJob = {
  [K in NotificationType]: { type: K; to: string; params: NotificationParams[K] }
}[NotificationType]
