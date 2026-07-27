import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'
import type { WhatsAppJob } from '../notifications/types'

/**
 * Fila do canal WhatsApp (Z-API). Backoff mais folgado que o do e-mail: uma
 * falha aqui costuma ser a instância caindo do WhatsApp Web, que leva mais que
 * 20s para voltar. 5 tentativas ao longo de ~8min antes de desistir.
 */
export const whatsappQueue = new Queue<WhatsAppJob>('whatsapp', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 30_000 }, // 30s, 1m, 2m, 4m
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 604_800 },
  },
})

export function enqueueWhatsApp(job: WhatsAppJob, opts?: { key?: string }) {
  return whatsappQueue.add(job.type, job, { jobId: opts?.key })
}
