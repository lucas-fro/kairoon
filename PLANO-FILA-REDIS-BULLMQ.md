# Plano: Fila de disparos com Redis + BullMQ + camada de canais plugável

## Context

Hoje todo e-mail transacional é enviado **inline no processo da API**, direto pelo Resend, dentro de `backend/src/lib/mailer.ts` (`sendEmail()` é o único ponto que chama `resend.emails.send`). Os dois únicos produtores são fire-and-forget em `backend/src/modules/auth/service.ts` (boas-vindas na L105, código de redefinição na L185). Funciona, mas:

- **Sem retry**: se o Resend cair, o e-mail é perdido (só vai pro log).
- **Não escala pro roadmap**: vamos adicionar WhatsApp e mais tipos de disparo (centenas/milhares por dia). O [TODO.md](TODO.md) já lista *"Adicionar fila para disparo de WhatsApp e e-mail"*.
- **Acoplado ao canal**: a regra de negócio conhece "e-mail", não "notificar o usuário".

**Objetivo**: introduzir Redis + BullMQ com um **processo worker separado** e uma **camada de notificação com canais plugáveis**. O produtor (API) apenas enfileira uma notificação lógica `{ tipo, destinatário, dados }`; o worker consome, renderiza por canal e entrega. Os 2 e-mails de hoje passam a ir pela fila (provando a base ponta a ponta). WhatsApp, lembretes e workers de relatório/backup entram depois **no mesmo padrão, sem tocar no núcleo**.

**Decisões do usuário** (já tomadas):
1. **Escopo**: fundação + migrar os 2 e-mails atuais. WhatsApp/lembretes/relatórios = próximos passos (não implementar agora, mas deixar encaixável).
2. **Abstração**: camada de canais plugável. O job carrega `{ tipo, dados }` (não HTML pronto); cada canal renderiza do seu jeito.

## Realidade da infra que molda o plano

- Backend roda **TypeScript direto via `tsx`** (sem build/`dist`), `node:22-alpine`, npm, ESM com top-level await.
- Deploy: VPS com [docker-compose.yml](docker-compose.yml) (serviços `backend`, `frontend`, `lp`) atrás do Caddy, na rede **externa `web`**. **Postgres roda em OUTRO compose** (fora deste repo), acessado pela rede `web`. **Não há Redis hoje.**
- `backend/Dockerfile` tem `ENTRYPOINT ["./docker-entrypoint.sh"]`, que roda `db:create` + `db:migrate` e então `npm run start`. → O worker **precisa sobrescrever o entrypoint** pra não rodar migrations.
- `db`/`pool` são singletons em `backend/src/db/index.ts` — o worker importa direto, sem Fastify. `pg.Pool` é lazy (0 conexões até a 1ª query), então `pool.end()` no worker que não consulta o banco é no-op seguro.
- **Não existe graceful shutdown** em lugar nenhum (nada fecha `pool`/`app`). Vamos adicionar nos dois processos.
- Duas superfícies de env: **`backend/.env`** (dev, `tsx` carrega via `dotenv/config`) e **root `.env`** (prod, `env_file: .env` do compose). `REDIS_URL` vai nos dois `.env.example`.
- Rede `web` é compartilhada → endereçar o Redis por **nome de container `kairoon-redis`**, não `redis` (evita colisão com outro stack). É como o Postgres já é endereçado.

## Arquitetura

```
API (produtor)                          Worker (consumidor, processo separado)
  auth/service.ts                          workers/index.ts → email.worker.ts
    └ void notify(tipo, to, dados)            └ Worker('email')
         │                                        renderiza via mailer.ts (builders atuais)
         ▼                                        └ entrega (Resend)  ── retry/backoff automático
   notifications/dispatcher.ts
     roteia tipo→canais, enfileira best-effort
         │
         ▼
   queues/email.queue.ts ──►  Redis (BullMQ)  ──►  (BZPOPMIN bloqueante no worker)
```

**Regra de ouro (separação produtor/consumidor):** `queues/` é importado pela **API e pelo worker**; `workers/` **só** pelo `worker.ts`. Motivo concreto: o `Worker` estaciona uma conexão em comando bloqueante; se worker e API dividissem processo/conexão, o `queue.add()` da API sofreria latência e um throw no processamento poderia derrubar o HTTP. Processos separados dão a cada lado sua própria conexão de graça. O worker **nunca** importa `buildApp()` (subiria as 18 rotas + JWT + rate-limit no processo errado) — entrypoints separados (`server.ts` vs `worker.ts`) garantem isso fisicamente.

## Arquivos novos (8) — `backend/src/`

### `lib/redis.ts` — conexão ioredis compartilhada (uma por processo)
`maxRetriesPerRequest: null` é **obrigatório** pro `Worker` do BullMQ (senão ele recusa iniciar). Listener de `error` pra queda de conexão não virar unhandled.
```ts
import { Redis } from 'ioredis'
import { env } from '../env'
export const redisConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
redisConnection.on('error', (err) => console.error('[redis] connection error:', err.message))
```

### `notifications/types.ts` — o contrato `{ tipo, dados }`
União discriminada → o worker faz `switch` exaustivo e type-safe. Adicionar um tipo aqui força tratá-lo no worker.
```ts
export type Channel = 'email' // futuro: | 'whatsapp'
export type NotificationParams = {
  welcome: { name: string; establishmentName: string }
  password_reset: { name: string; code: string }
}
export type NotificationType = keyof NotificationParams
export type EmailJob = { [K in NotificationType]: { type: K; to: string; params: NotificationParams[K] } }[NotificationType]
```

### `queues/email.queue.ts` — Queue + enqueue tipado + limites de memória
`jobId` = chave de idempotência (deduplica enfileiramento enquanto o job existe). `removeOnComplete/Fail` limitam memória do Redis.
```ts
import { Queue } from 'bullmq'
import { redisConnection } from '../lib/redis'
import type { EmailJob } from '../notifications/types'
export const emailQueue = new Queue<EmailJob>('email', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },  // 5s, 10s, 20s
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 604_800 },                  // guarda falhas 7d
  },
})
export function enqueueEmail(job: EmailJob, opts?: { key?: string }) {
  return emailQueue.add(job.type, job, { jobId: opts?.key })
}
```

### `queues/index.ts` — registry + seam de shutdown
```ts
export { emailQueue, enqueueEmail } from './email.queue'
import { emailQueue } from './email.queue'
export async function closeQueues() { await emailQueue.close() } // futuro: Promise.all([...])
```

### `notifications/dispatcher.ts` — API pública do produtor (roteamento + enqueue best-effort)
Roteia `tipo → canais` (o seam do WhatsApp) e enfileira **best-effort**: nunca lança no caminho da request e faz **timeout de 2s** no enqueue pra uma queda do Redis não pendurar promise nem atrasar o cadastro. Espelha o fire-and-forget de hoje.
```ts
import { enqueueEmail } from '../queues'
import type { Channel, NotificationType, NotificationParams, EmailJob } from './types'
const ROUTES: Record<NotificationType, Channel[]> = { welcome: ['email'], password_reset: ['email'] }
function withTimeout<T>(p: Promise<T>, ms: number) {
  return Promise.race([p, new Promise<never>((_, r) => setTimeout(() => r(new Error('enqueue timeout')), ms))])
}
export async function notify<T extends NotificationType>(
  type: T, to: string, params: NotificationParams[T], opts?: { key?: string },
) {
  for (const channel of ROUTES[type]) {
    try {
      if (channel === 'email') await withTimeout(enqueueEmail({ type, to, params } as EmailJob, opts), 2000)
    } catch (err) {
      console.error(`[notify] falha ao enfileirar ${type} via ${channel}:`, err)
    }
  }
}
```

### `workers/email.worker.ts` — o consumidor
Renderiza de `{ tipo, dados }` chamando os **builders atuais do `mailer.ts`** (é o "consumidor renderiza"). Throw → retry/backoff do BullMQ. Limiter respeita o rate limit do Resend.
```ts
import { Worker } from 'bullmq'
import { redisConnection } from '../lib/redis'
import { sendWelcomeEmail, sendPasswordResetEmail } from '../lib/mailer'
import type { EmailJob } from '../notifications/types'
export function createEmailWorker() {
  const worker = new Worker<EmailJob>('email', async (job) => {
    const d = job.data
    switch (d.type) {
      case 'welcome': return sendWelcomeEmail(d.to, d.params.name, d.params.establishmentName)
      case 'password_reset': return sendPasswordResetEmail(d.to, d.params.name, d.params.code)
    }
  }, { connection: redisConnection, concurrency: 5, limiter: { max: 2, duration: 1000 } })
  worker.on('failed', (job, err) => console.error(`[email.worker] job ${job?.id} falhou:`, err.message))
  worker.on('error', (err) => console.error('[email.worker] error:', err))
  return worker
}
```

### `workers/index.ts` — registry de workers
```ts
import type { Worker } from 'bullmq'
import { createEmailWorker } from './email.worker'
let workers: Worker[] = []
export function startWorkers() { workers = [createEmailWorker()]; console.log(`[workers] ${workers.length} worker(s) iniciado(s)`) }
export async function stopWorkers() { await Promise.all(workers.map((w) => w.close())) } // espera in-flight
```

### `worker.ts` — entrypoint do processo (espelha `server.ts`) + graceful shutdown
```ts
import './env'                 // valida env no boot (precisa de JWT_SECRET, presente via env_file)
import { pool } from './db'
import { redisConnection } from './lib/redis'
import { startWorkers, stopWorkers } from './workers'
startWorkers()
console.log('[worker] up, consumindo filas')
let down = false
async function shutdown(signal: string) {
  if (down) return; down = true
  console.log(`[worker] ${signal} recebido, drenando...`)
  try { await stopWorkers(); await redisConnection.quit(); await pool.end() } finally { process.exit(0) }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
```

## Arquivos editados

### `backend/src/env.ts` — adicionar `REDIS_URL` (com default, como `DATABASE_URL`)
Redis é infra core (não feature opcional como `RESEND_API_KEY`); default dá dev zero-config e, como o dispatcher é best-effort, URL errada degrada pra "e-mail perdido + log", nunca crash de boot.
```ts
REDIS_URL: z.string().default('redis://localhost:6379'),
```

### `backend/src/modules/auth/service.ts` — trocar os 2 produtores
- **L7**: `import { notify } from '../../notifications/dispatcher'` (remove o import do mailer).
- **L105-107** (boas-vindas):
```ts
void notify('welcome', result.user.email,
  { name: result.user.name, establishmentName: result.establishment.name },
  { key: `welcome:${result.user.id}` })
```
- **L185-187** (redefinição — `passwordResetExpiresAt` já está no escopo na L177):
```ts
void notify('password_reset', user.email, { name: user.name, code },
  { key: `password_reset:${user.id}:${passwordResetExpiresAt.getTime()}` })
```
`notify` nunca rejeita → sai o `.catch(...)`; o `void` mantém fire-and-forget (zero latência a mais).

### `backend/src/server.ts` — graceful shutdown (lacuna pré-existente)
Depois do bloco `app.listen`, importar `{ closeQueues } from './queues'` e `{ pool } from './db'`, e:
```ts
async function shutdown(signal: string) {
  app.log.info(`${signal} recebido, encerrando...`)
  try { await app.close(); await closeQueues(); await pool.end() } finally { process.exit(0) }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
```

### `backend/package.json`
- `dependencies`: adicionar `bullmq` e `ioredis` (importamos `Redis` do ioredis direto → declarar explícito).
- `scripts` (após `start`): `"worker": "tsx src/worker.ts"`, `"worker:dev": "tsx watch src/worker.ts"`.
- Rodar `npm install bullmq ioredis` local e **commitar o `package-lock.json`** (o Dockerfile usa `npm ci`, que falha se o lock estiver dessincronizado).

### `backend/.env.example` (dev) e root `.env.example` (prod)
- dev: `REDIS_URL=redis://localhost:6379`
- prod: `REDIS_URL=redis://kairoon-redis:6379`

## Infra: `docker-compose.yml` (2 serviços + volume)

**Serviço `redis`** (persistência AOF; `noeviction` pra errar em vez de descartar dados de fila silenciosamente):
```yaml
  redis:
    image: redis:7-alpine
    container_name: kairoon-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
    volumes: [redis-data:/data]
    networks: [web]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
```

**Serviço `worker`** — reusa a imagem `kairoon-backend`; o **crucial** é o `entrypoint:` que substitui o `docker-entrypoint.sh` (sem migrations, sem HTTP). Só o `backend` migra (evita race de `drizzle-kit migrate`):
```yaml
  worker:
    build: ./backend
    image: kairoon-backend
    container_name: kairoon-worker
    restart: unless-stopped
    env_file: .env
    environment: { NODE_ENV: production }
    entrypoint: ["npm", "run", "worker"]   # substitui docker-entrypoint.sh
    depends_on:
      redis: { condition: service_healthy }
    networks: [web]
```

**Volume** (não há bloco `volumes:` hoje — adicionar no topo):
```yaml
volumes:
  redis-data:
```

**`backend` (API)**: adicionar apenas ordem de start, **nunca** health gate (cadastro deve funcionar mesmo com Redis fora — best-effort):
```yaml
    depends_on: [redis]
```

## Dev no Windows
Redis não tem build nativo Windows. Recomendado: container descartável (Docker Desktop):
```
docker run -d --name kairoon-redis-dev -p 6379:6379 redis:7-alpine
```
Alternativas: WSL2 (`apt install redis-server`) ou Memurai (serviço nativo compatível). Todos escutam em `localhost:6379` → sem mudança de código. Rodar API + worker em dois terminais (a partir de `backend/`): `npm run dev` e `npm run worker:dev`.

## Gotchas
- **Lockfile**: adicionar deps sem commitar `package-lock.json` quebra o build (`npm ci`).
- **Alpine ok**: bullmq/ioredis são JS puro (sem addon nativo), como o `bcryptjs` já usado.
- **Redis fora no enqueue**: o `withTimeout(2s)` + `void notify` garantem que a resposta HTTP nunca atrasa; o e-mail pode ser descartado (igual a hoje quando o Resend está fora).
- **Memória do Redis**: `removeOnComplete/Fail` + `noeviction` evitam OOM e corrupção de fila.
- **At-least-once**: `jobId` deduplica *enfileiramento*, não *processamento* — se o worker entregar e morrer antes do ack, ou o job "stall" (~30s), BullMQ reprocessa e pode sair 2º e-mail. Pra welcome/reset é inofensivo. Disparo crítico futuro → tabela "sent" checada no topo do worker.
- **Nunca deixe o worker rodar o `docker-entrypoint.sh`** (o `entrypoint:` override é o que impede 2 migradores simultâneos).

## Verificação (ponta a ponta, local)
1. `docker run -d --name kairoon-redis-dev -p 6379:6379 redis:7-alpine`
2. `cd backend && npm install`; deixar `RESEND_API_KEY` vazio na 1ª passada.
3. Terminal A `npm run dev`; Terminal B `npm run worker:dev` → B loga `[worker] up` e `[workers] 1 worker(s)`.
4. **Register**: `POST /auth/register` (porta do `.env`; neste dev é 3334). Espera 201 imediato; o worker loga o job e, sem chave Resend, imprime `RESEND_API_KEY ausente — ... NÃO enviado` — prova enqueue→consumo sem a request esperar.
5. **Forgot password**: `POST /auth/forgot-password/request` `{ "email": "<o registrado>" }` → worker imprime o código (no-op de dev preservado no `mailer.ts`).
6. **Retry/backoff**: pôr `RESEND_API_KEY` bogus, reiniciar o worker, registrar de novo → `sendEmail` lança `AppError(502)` → worker loga `failed` e BullMQ retenta ~5s/~10s, depois cai no set `failed` após 3 tentativas.
7. **Inspecionar Redis**: `redis-cli keys 'bull:email:*'`, `llen bull:email:wait`, `zrange bull:email:failed 0 -1`. Re-registrar o mesmo user antes do job completar e confirmar que não surge 2º `bull:email:welcome:<userId>` prova a idempotência.
8. **Dois processos**: local, 2 processos node; prod, `docker compose up -d --build` e `docker compose ps` mostra `kairoon-backend`, `kairoon-worker`, `kairoon-redis`; `logs backend` mostra migrations, `logs worker` **não**.

## Fora de escopo (encaixe futuro, sem mexer no núcleo)
- **Canal WhatsApp**: `Channel = 'email' | 'whatsapp'`; novos `queues/whatsapp.queue.ts` + `workers/whatsapp.worker.ts` (uma linha em cada registry); `ROUTES.welcome = ['email','whatsapp']` + branch no dispatcher. Momento natural pra extrair `mailer.ts` → `channels/email.ts` (move mecânico). **Exige** também campo de consentimento/opt-in em `clients` (LGPD) — hoje inexistente.
- **Lembretes de agendamento**: novo tipo `appointment_reminder`; jobs com `delay` (BullMQ delayed) ou repeatable varrendo o banco. Worker é o 1º a `import { db }` — por isso o `worker.ts` já fecha o `pool`.
- **Workers de relatório/backup/import**: par `queues/*.queue.ts` + `workers/*.worker.ts`, registrados nos mesmos registries e iniciados pelo mesmo `worker.ts`. Não passam pelo dispatcher (não são mensagens). Se um processo ficar cheio, separar via flag de env qual worker cada processo sobe.
- **Observabilidade (opcional)**: `@bull-board/fastify` numa rota admin autenticada pra ver filas/jobs.
