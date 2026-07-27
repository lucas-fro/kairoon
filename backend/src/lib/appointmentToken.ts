import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../env'

/**
 * Token do link "cancelar/remarcar" enviado ao cliente por WhatsApp/e-mail.
 *
 * É stateless (HMAC do id com o JWT_SECRET), não uma coluna no banco: não exige
 * migration de backfill nem storage, e continua impossível de forjar sem o
 * segredo. Também não expira sozinho — quem caduca é o agendamento, e as rotas
 * que consomem o token rejeitam passado/cancelado/concluído.
 *
 * Não confunda com o JWT de dono: este token NÃO autentica ninguém no painel,
 * só dá acesso a UM agendamento na área pública.
 */

const SEPARATOR = '.'
const SIGNATURE_LENGTH = 32

function sign(appointmentId: string): string {
  return createHmac('sha256', env.JWT_SECRET)
    .update(appointmentId)
    .digest('hex')
    .slice(0, SIGNATURE_LENGTH)
}

export function createAppointmentToken(appointmentId: string): string {
  return `${appointmentId}${SEPARATOR}${sign(appointmentId)}`
}

/** Devolve o id do agendamento, ou null se o token for inválido/adulterado. */
export function verifyAppointmentToken(token: string): string | null {
  const index = token.lastIndexOf(SEPARATOR)
  if (index <= 0) return null

  const appointmentId = token.slice(0, index)
  const signature = token.slice(index + 1)
  const expected = sign(appointmentId)

  // Comparação em tempo constante para não vazar o prefixo correto da
  // assinatura pelo tempo de resposta.
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null

  return appointmentId
}

/** URL pública completa da página de gerenciamento já com o token. */
export function buildManageUrl(appUrl: string, slug: string, appointmentId: string): string {
  const token = createAppointmentToken(appointmentId)
  return `${appUrl}/${slug}/editagendamento?t=${token}`
}
