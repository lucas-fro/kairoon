import { Worker } from 'bullmq'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { appointments } from '../db/schema'
import { redisConnection } from '../lib/redis'
import { sendWhatsAppText } from '../lib/zapiClient'
import { renderWhatsApp } from '../notifications/templates/whatsapp'
import type { WhatsAppJob } from '../notifications/types'

/**
 * Consumidor do canal WhatsApp. `limiter` de 1 mensagem a cada 1,5s e
 * `concurrency: 1`: o WhatsApp Web bane rajada, e a instância Z-API é uma só
 * (número global do Kairoon) — vazão maior aqui não ganha nada e arrisca a
 * conta inteira.
 */
export function createWhatsAppWorker() {
  const worker = new Worker<WhatsAppJob>(
    'whatsapp',
    async (job) => {
      const d = job.data
      await sendWhatsAppText(d.to, renderWhatsApp(d))

      // Carimba só DEPOIS do envio: se a Z-API falhar, o agendamento continua
      // elegível e a próxima varredura tenta de novo. O carimbo é o que garante
      // "no máximo um lembrete por agendamento".
      if (d.type === 'appointment_reminder') {
        await db
          .update(appointments)
          .set({ reminderSentAt: new Date() })
          .where(eq(appointments.id, d.params.appointmentId))
      }
    },
    { connection: redisConnection, concurrency: 1, limiter: { max: 1, duration: 1500 } },
  )

  worker.on('failed', (job, err) =>
    console.error(`[whatsapp.worker] job ${job?.id} falhou:`, err.message),
  )
  worker.on('error', (err) => console.error('[whatsapp.worker] error:', err))
  return worker
}
