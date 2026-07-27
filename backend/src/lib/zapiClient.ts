import { env } from '../env'
import { AppError } from './errors'
import { normalizePhone } from './slots'

/**
 * WhatsApp transacional via Z-API (https://developer.z-api.io).
 *
 * A URL carrega as credenciais da instância no caminho:
 *   https://api.z-api.io/instances/{ID}/token/{TOKEN}/send-text
 * e o "Token de Segurança da Conta" vai no header `Client-Token` (obrigatório
 * depois de ativado no painel Z-API). Nunca chame isto do navegador: quem tem
 * ID + token envia mensagem no nosso nome.
 *
 * Sem as variáveis configuradas os envios viram no-op (apenas logados), igual
 * ao mailer.ts: dev sobe sem conta Z-API e nada quebra.
 */

const BASE_URL = 'https://api.z-api.io'

function isConfigured(): boolean {
  return Boolean(env.ZAPI_INSTANCE_ID && env.ZAPI_TOKEN)
}

/**
 * Formato exigido pela Z-API: só dígitos, com DDI na frente (5511999999999).
 * Os telefones do banco são normalizados sem DDI (11 dígitos: DDD + 9 + número),
 * então prefixamos 55 quando ele não veio. Devolve null se não sobrar um número
 * plausível — melhor não enviar do que enviar para o número errado.
 */
export function toZapiPhone(rawPhone: string): string | null {
  const digits = normalizePhone(rawPhone)
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return null
}

interface SendTextResponse {
  zaapId?: string
  messageId?: string
  id?: string
}

/**
 * Envia uma mensagem de texto. Lança AppError(502) em falha para o BullMQ
 * retentar com backoff; o worker é quem trata o erro.
 */
export async function sendWhatsAppText(rawPhone: string, message: string): Promise<void> {
  if (!isConfigured()) {
    console.warn(`[zapi] ZAPI_INSTANCE_ID/ZAPI_TOKEN ausentes: mensagem para ${rawPhone} NÃO enviada.`)
    return
  }

  const phone = toZapiPhone(rawPhone)
  if (!phone) {
    // Número impossível de discar: retentar não resolve, então não lançamos
    // (lançar faria o BullMQ repetir 5x o mesmo erro determinístico).
    console.warn(`[zapi] telefone inválido para WhatsApp: "${rawPhone}". Mensagem descartada.`)
    return
  }

  const url = `${BASE_URL}/instances/${env.ZAPI_INSTANCE_ID}/token/${env.ZAPI_TOKEN}/send-text`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.ZAPI_CLIENT_TOKEN ? { 'Client-Token': env.ZAPI_CLIENT_TOKEN } : {}),
      },
      body: JSON.stringify({ phone, message }),
    })
  } catch (err) {
    throw new AppError(
      `Falha de rede ao enviar WhatsApp: ${err instanceof Error ? err.message : String(err)}`,
      502,
    )
  }

  const body = (await response.json().catch(() => null)) as (SendTextResponse & { error?: string }) | null

  if (!response.ok) {
    const detail = body?.error ?? `HTTP ${response.status}`
    throw new AppError(`Não foi possível enviar o WhatsApp: ${detail}`, 502)
  }
}
