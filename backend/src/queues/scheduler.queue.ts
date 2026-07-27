import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'

/** Nome do job repetitivo que varre a agenda procurando lembretes a enviar. */
export const REMINDER_SCAN_JOB = 'reminder-scan'

/** De quantos em quantos minutos a varredura roda. */
export const REMINDER_SCAN_CRON = '*/10 * * * *'

/**
 * Fila de jobs periódicos (não são mensagens: não passam pelo dispatcher).
 * Hoje só a varredura de lembretes. Sem retry: se uma varredura falhar, a
 * próxima (10 min depois) refaz o mesmo trabalho, porque a busca é derivada do
 * estado do banco e não do job.
 */
export const schedulerQueue = new Queue('scheduler', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 3600, count: 50 },
    removeOnFail: { age: 86_400 },
  },
})

/**
 * Registra (idempotente) o job repetitivo. O `jobId` fixo evita que cada
 * reinício do worker crie mais um agendador — sem ele, N restarts = N
 * varreduras simultâneas.
 */
export async function scheduleReminderScan(): Promise<void> {
  await schedulerQueue.add(
    REMINDER_SCAN_JOB,
    {},
    { jobId: REMINDER_SCAN_JOB, repeat: { pattern: REMINDER_SCAN_CRON } },
  )
}
