import { Worker } from 'bullmq'
import {
  sendAppointmentConfirmationEmail,
  sendAppointmentReminderEmail,
  sendPasswordResetEmail,
  sendStaffInviteEmail,
  sendWelcomeEmail,
} from '../lib/mailer'
import { redisConnection } from '../lib/redis'
import type { EmailJob } from '../notifications/types'

/**
 * Consumidor do canal e-mail: recebe `{ tipo, dados }` e renderiza chamando os
 * builders do mailer.ts. Um throw aqui devolve o job para o retry/backoff do
 * BullMQ. O `limiter` respeita o rate limit do Resend.
 */
export function createEmailWorker() {
  const worker = new Worker<EmailJob>(
    'email',
    async (job) => {
      const d = job.data
      switch (d.type) {
        case 'welcome':
          return sendWelcomeEmail(d.to, d.params.name, d.params.establishmentName)
        case 'password_reset':
          return sendPasswordResetEmail(d.to, d.params.name, d.params.code)
        case 'staff_invite':
          return sendStaffInviteEmail({ to: d.to, ...d.params })
        case 'appointment_confirmed':
          return sendAppointmentConfirmationEmail(d.to, d.params)
        case 'appointment_reminder':
          return sendAppointmentReminderEmail(d.to, d.params)
        // Roteados só para WhatsApp (ver ROUTES no dispatcher). Se um dia forem
        // roteados para cá, o e-mail correspondente precisa ser escrito antes.
        case 'appointment_cancelled':
        case 'manage_access_code':
          console.warn(`[email.worker] tipo "${d.type}" não tem template de e-mail. Ignorado.`)
          return
      }
    },
    { connection: redisConnection, concurrency: 5, limiter: { max: 2, duration: 1000 } },
  )

  worker.on('failed', (job, err) => console.error(`[email.worker] job ${job?.id} falhou:`, err.message))
  worker.on('error', (err) => console.error('[email.worker] error:', err))
  return worker
}
