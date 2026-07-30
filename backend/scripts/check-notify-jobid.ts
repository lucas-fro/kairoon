/**
 * Prova que os jobIds gerados pelo dispatcher passam pela validação do BullMQ.
 * A regra abaixo é copiada de node_modules/bullmq/dist/cjs/classes/job.js
 * (Job.validateOptions): rejeita jobId com ':' que não parta em exatamente 3.
 */
const bullmqRejeita = (jobId: string) => jobId.includes(':') && jobId.split(':').length !== 3

// Espelha dispatcher.ts: prefixo de canal + troca de ':' por '-'.
const buildKey = (channel: string, key: string) => `${channel}-${key}`.replace(/:/g, '-')

const UUID = '95b1f440-757a-4cc7-8ea4-3c8d19104af4'
const TS = 1785258310000

// As chaves REAIS de cada call site (grep 'key: `' em src/).
const callSites: [string, string][] = [
  ['welcome (auth/service.ts:198)', `welcome:${UUID}`],
  ['password_reset (auth/service.ts:351)', `password_reset:${UUID}:${TS}`],
  ['staff_invite (access/service.ts:130)', `staff_invite:${UUID}:${TS}`],
  ['appointment_confirmed (appointment.ts:72)', `appointment_confirmed:${UUID}:2026-07-28:09:00`],
  ['appointment_reminder (appointment.ts:72)', `appointment_reminder:${UUID}:2026-07-28:14:30`],
]

let failed = 0
const gerados = new Set<string>()

for (const [nome, raw] of callSites) {
  for (const channel of ['email', 'whatsapp']) {
    const antes = `${channel}:${raw}` // como era antes da correção
    const depois = buildKey(channel, raw)
    gerados.add(depois)

    const okDepois = !bullmqRejeita(depois)
    const semDoisPontos = !depois.includes(':')
    if (!okDepois || !semDoisPontos) failed++

    if (channel === 'email') {
      console.log(
        `${okDepois ? 'ok   ' : 'FALHA'} ${nome}\n` +
          `        antes:  ${antes}  ${bullmqRejeita(antes) ? '(REJEITADO)' : '(aceito)'}\n` +
          `        depois: ${depois}  ${okDepois ? '(aceito)' : '(REJEITADO)'}`,
      )
    }
  }
}

// A unicidade por canal (motivo do prefixo) tem que sobreviver à troca.
const esperado = callSites.length * 2
console.log(
  `\n${gerados.size === esperado ? 'ok   ' : 'FALHA'} unicidade por canal: ${gerados.size}/${esperado} ids distintos`,
)
if (gerados.size !== esperado) failed++

console.log(failed === 0 ? '\nTUDO CERTO' : `\n${failed} FALHA(S)`)
process.exit(failed === 0 ? 0 : 1)
