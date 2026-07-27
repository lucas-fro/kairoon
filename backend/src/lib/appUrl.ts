import { env } from '../env'

/**
 * Base pública da app (primeira origem do CORS), usada para montar links em
 * e-mails e mensagens de WhatsApp. Vive num módulo próprio porque agora dois
 * canais precisam dela: mailer.ts e os templates de WhatsApp.
 */
export const APP_URL = env.CORS_ORIGIN.split(',')[0].trim()
