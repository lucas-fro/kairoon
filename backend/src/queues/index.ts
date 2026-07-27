import { emailQueue } from './email.queue'
import { schedulerQueue } from './scheduler.queue'
import { whatsappQueue } from './whatsapp.queue'

export { emailQueue, enqueueEmail } from './email.queue'
export { whatsappQueue, enqueueWhatsApp } from './whatsapp.queue'
export {
  schedulerQueue,
  scheduleReminderScan,
  REMINDER_SCAN_JOB,
  REMINDER_SCAN_CRON,
} from './scheduler.queue'

/** Seam de shutdown: os dois processos (API e worker) fecham por aqui. */
export async function closeQueues(): Promise<void> {
  await Promise.all([emailQueue.close(), whatsappQueue.close(), schedulerQueue.close()])
}
