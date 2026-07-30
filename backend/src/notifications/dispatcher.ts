import { enqueueEmail, enqueueWhatsApp } from '../queues'
import type {
  Channel,
  EmailJob,
  NotificationParams,
  NotificationType,
  Recipient,
  WhatsAppJob,
} from './types'

/**
 * Roteamento tipo → canais. É o único lugar que decide "isto vai por onde".
 * Ligar o WhatsApp em `welcome`, por exemplo, é editar uma linha aqui.
 */
const ROUTES: Record<NotificationType, Channel[]> = {
  welcome: ['email'],
  password_reset: ['email'],
  staff_invite: ['email'],
  // WhatsApp é o canal principal do cliente final; e-mail entra como reforço
  // quando ele informou um (o campo é opcional no agendamento).
  appointment_confirmed: ['whatsapp', 'email'],
  appointment_reminder: ['whatsapp', 'email'],
  appointment_cancelled: ['whatsapp'],
  // Código de verificação: só faz sentido em canal instantâneo.
  manage_access_code: ['whatsapp'],
}

/**
 * Chave geral do canal WhatsApp, desligada enquanto a instância Z-API não
 * estabiliza. **Para religar: mude para `true`** — nada mais precisa ser tocado,
 * porque este é o único ponto do sistema que enfileira mensagem de WhatsApp.
 *
 * O corte é aqui (antes do enfileiramento) de propósito: nenhum job chega a
 * existir, então o worker não roda e `appointments.reminderSentAt` continua
 * null. Os lembretes deste período seguem valendo quando o canal voltar. Se o
 * corte fosse lá no zapiClient, ele retornaria sem erro, o worker acharia que
 * entregou e carimbaria o lembrete como enviado — perda silenciosa.
 */
const WHATSAPP_ENABLED = false

/** Canais efetivos de um tipo, já respeitando a chave geral acima. */
function channelsFor(type: NotificationType): Channel[] {
  return ROUTES[type].filter((channel) => channel !== 'whatsapp' || WHATSAPP_ENABLED)
}

/**
 * Sobrou algum canal para este tipo? Quem produz em lote (a varredura de
 * lembretes) consulta antes de varrer o banco à toa. Pergunta por TIPO, e não
 * "o WhatsApp está ligado?", para que desligar um canal nunca silencie um tipo
 * que ainda tem outro caminho de entrega.
 */
export function hasActiveChannel(type: NotificationType): boolean {
  return channelsFor(type).length > 0
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('enqueue timeout')), ms).unref?.(),
    ),
  ])
}

/**
 * API pública do produtor. Enfileira **best-effort**: nunca lança no caminho da
 * request e faz timeout de 2s no enqueue, para que uma queda do Redis não
 * pendure a promise nem atrase a resposta HTTP. O pior caso é o mesmo de hoje
 * quando o Resend está fora: notificação perdida + log.
 *
 * Use com `void notify(...)` para manter o fire-and-forget.
 */
export async function notify<T extends NotificationType>(
  type: T,
  to: Recipient,
  params: NotificationParams[T],
  opts?: { key?: string },
): Promise<void> {
  for (const channel of channelsFor(type)) {
    const destination = channel === 'email' ? to.email : to.phone
    if (!destination) continue
    // O jobId precisa ser único POR CANAL: com a mesma chave nos dois, o
    // segundo enqueue seria silenciosamente descartado como duplicata.
    //
    // E NÃO pode conter ':'. O BullMQ rejeita o enqueue inteiro com "Custom Id
    // cannot contain :" (ele usa o caractere como separador das próprias chaves
    // no Redis); só tolera quando o id parte em exatamente 3 pedaços, um
    // carve-out legado de jobs repetíveis. Contar dois-pontos seria frágil, então
    // trocamos todos. A limpeza mora aqui, no único ponto por onde todo produtor
    // passa, para nenhum deles precisar conhecer essa restrição do BullMQ.
    const key = opts?.key ? `${channel}-${opts.key}`.replace(/:/g, '-') : undefined
    try {
      const job = { type, to: destination, params }
      if (channel === 'email') {
        await withTimeout(enqueueEmail(job as EmailJob, { key }), 2000)
      } else {
        await withTimeout(enqueueWhatsApp(job as WhatsAppJob, { key }), 2000)
      }
    } catch (err) {
      console.error(`[notify] falha ao enfileirar ${type} via ${channel}:`, err)
    }
  }
}
