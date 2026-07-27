import { addDays, formatDayMonthBr, todayStr, weekdayNamePt } from '../../lib/datetime'
import { firstName, formatBRL } from '../../lib/mailer'
import type { AppointmentMsgParams, WhatsAppJob } from '../types'

/**
 * Renderização do canal WhatsApp: texto puro com a marcação do próprio app
 * (*negrito*). Nada de HTML e nada de linha em branco dupla (o WhatsApp colapsa
 * e a mensagem fica torta).
 */

function appointmentBlock(p: AppointmentMsgParams): string {
  return [
    `📅 ${weekdayNamePt(p.date)}, ${formatDayMonthBr(p.date)}`,
    `🕐 ${p.startTime}`,
    `💈 ${p.serviceName} com ${p.employeeName}`,
    `💰 ${formatBRL(p.priceCents)}`,
  ].join('\n')
}

function manageBlock(p: AppointmentMsgParams): string {
  return `Precisa cancelar ou remarcar? Acesse:\n${p.manageUrl}`
}

function confirmed(p: AppointmentMsgParams): string {
  const header = p.pending
    ? `Recebemos seu pedido de agendamento na *${p.establishmentName}*. Você será avisado assim que for confirmado.`
    : `Seu agendamento na *${p.establishmentName}* está confirmado!`
  return [`Olá, ${firstName(p.clientName)}! 👋`, '', header, '', appointmentBlock(p), '', manageBlock(p)].join(
    '\n',
  )
}

/**
 * "amanhã" é calculado, não assumido: se a varredura atrasar (worker fora do ar,
 * fila represada), o lembrete pode sair no próprio dia do atendimento, e dizer
 * "amanhã" ali seria informação errada na mão do cliente.
 */
function whenLabel(date: string): string {
  const today = todayStr()
  if (date === today) return '*hoje*'
  if (date === addDays(today, 1)) return '*amanhã*'
  return `em *${formatDayMonthBr(date)}*`
}

function reminder(p: AppointmentMsgParams): string {
  return [
    `Olá, ${firstName(p.clientName)}! 👋`,
    '',
    `Lembrete: você tem um agendamento ${whenLabel(p.date)} na *${p.establishmentName}*.`,
    '',
    appointmentBlock(p),
    '',
    manageBlock(p),
  ].join('\n')
}

function cancelled(p: AppointmentMsgParams): string {
  return [
    `Olá, ${firstName(p.clientName)}!`,
    '',
    `Seu agendamento na *${p.establishmentName}* foi *cancelado*:`,
    '',
    `📅 ${weekdayNamePt(p.date)}, ${formatDayMonthBr(p.date)} às ${p.startTime}`,
    `💈 ${p.serviceName} com ${p.employeeName}`,
    '',
    'Quando quiser, é só agendar de novo. Até logo! 👋',
  ].join('\n')
}

/**
 * Switch exaustivo sobre o tipo da notificação. `welcome` e `password_reset`
 * hoje não são roteados para WhatsApp (ver ROUTES no dispatcher), mas o caso
 * existe para o TypeScript garantir que nenhum tipo novo passe batido aqui.
 */
export function renderWhatsApp(job: WhatsAppJob): string {
  switch (job.type) {
    case 'appointment_confirmed':
      return confirmed(job.params)
    case 'appointment_reminder':
      return reminder(job.params)
    case 'appointment_cancelled':
      return cancelled(job.params)
    case 'manage_access_code':
      return [
        `Seu código de acesso na *${job.params.establishmentName}* é:`,
        '',
        `*${job.params.code}*`,
        '',
        'Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem.',
      ].join('\n')
    case 'welcome':
      return `Bem-vindo(a) ao Kairoon, ${firstName(job.params.name)}! Sua conta foi criada com sucesso.`
    case 'password_reset':
      return `Seu código para redefinir a senha do Kairoon é *${job.params.code}*. Ele vale por 15 minutos.`
    case 'staff_invite':
      return [
        `Olá, ${firstName(job.params.name)}! A *${job.params.establishmentName}* liberou seu acesso ao painel Kairoon.`,
        '',
        `Crie sua senha aqui: ${job.params.inviteUrl}`,
        '',
        `O link vale por ${job.params.expiresInDays} dias e só pode ser usado uma vez.`,
      ].join('\n')
  }
}
