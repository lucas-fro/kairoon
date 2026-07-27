import type { Worker } from 'bullmq'
import { scheduleReminderScan } from '../queues'
import { createEmailWorker } from './email.worker'
import { createSchedulerWorker } from './reminder.scheduler'
import { createWhatsAppWorker } from './whatsapp.worker'

let workers: Worker[] = []

export async function startWorkers(): Promise<void> {
  workers = [createEmailWorker(), createWhatsAppWorker(), createSchedulerWorker()]
  // Registro idempotente do job repetitivo: o jobId fixo impede que cada
  // reinício do worker crie mais um agendador.
  await scheduleReminderScan()
  console.log(`[workers] ${workers.length} worker(s) iniciado(s)`)
}

/** Espera os jobs em voo terminarem antes de encerrar. */
export async function stopWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()))
}
