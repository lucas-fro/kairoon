import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'
import type { EmailJob } from '../notifications/types'

/**
 * `removeOnComplete`/`removeOnFail` limitam a memória do Redis (que roda com
 * maxmemory-policy noeviction: sem isso a fila cresce até o OOM). Falhas ficam
 * 7 dias para dar tempo de investigar.
 */
export const emailQueue = new Queue<EmailJob>('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 604_800 },
  },
})

/** `key` vira o jobId: deduplica o ENFILEIRAMENTO enquanto o job existir. */
export function enqueueEmail(job: EmailJob, opts?: { key?: string }) {
  return emailQueue.add(job.type, job, { jobId: opts?.key })
}
