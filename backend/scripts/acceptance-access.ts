/**
 * Teste de aceitação dos níveis de acesso, via app.inject (sem subir servidor).
 * Cria um estabelecimento descartável, exercita os invariantes e apaga tudo.
 */
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app'
import { db, pool } from '../src/db'
import {
  clients,
  employees,
  establishments,
  services,
  staffInvites,
  users,
  waitlistEntries,
} from '../src/db/schema'

const SUFFIX = randomBytes(4).toString('hex')
const OWNER_EMAIL = `dono.${SUFFIX}@teste.local`
const STAFF_EMAIL = `recep.${SUFFIX}@teste.local`
const PASSWORD = 'senha123'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1
    console.log(`  ok   ${name}`)
  } else {
    failed += 1
    console.log(`  FALHA ${name}`, detail ?? '')
  }
}

const app = await buildApp()

const hash = await bcrypt.hash(PASSWORD, 10)
const [est] = await db
  .insert(establishments)
  .values({
    name: `Teste ${SUFFIX}`,
    slug: `teste-${SUFFIX}`,
    trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
  })
  .returning()
const [ownerUser] = await db
  .insert(users)
  .values({ name: 'Dona Teste', email: OWNER_EMAIL, passwordHash: hash })
  .returning()
const [ownerEmployee] = await db
  .insert(employees)
  .values({ establishmentId: est.id, userId: ownerUser.id, name: 'Dona Teste', isOwner: true })
  .returning()
const [profissional] = await db
  .insert(employees)
  .values({ establishmentId: est.id, name: 'Profissional Teste', permissions: ['agenda.view'] })
  .returning()
const [recepcao] = await db
  .insert(employees)
  .values({
    establishmentId: est.id,
    name: 'Recepção Teste',
    email: STAFF_EMAIL,
    bookable: false,
    permissions: ['agenda.view', 'agenda.view_all', 'clients.view'],
  })
  .returning()

const json = (r: { body: string }) => {
  try {
    return JSON.parse(r.body)
  } catch {
    return null
  }
}
const auth = (token: string) => ({ authorization: `Bearer ${token}` })

// --- 1. Login do dono ------------------------------------------------------
const ownerLogin = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { email: OWNER_EMAIL, password: PASSWORD },
})
check('dono faz login', ownerLogin.statusCode === 200, ownerLogin.body)
const ownerToken = json(ownerLogin)?.token as string
check('login do dono devolve isOwner', json(ownerLogin)?.user?.isOwner === true)
check(
  'login do dono devolve o estabelecimento certo',
  json(ownerLogin)?.establishment?.id === est.id,
)

// --- 2. Convite ------------------------------------------------------------
const invite = await app.inject({
  method: 'POST',
  url: `/access/employees/${recepcao.id}/invite`,
  headers: auth(ownerToken),
})
check('dono envia convite', invite.statusCode === 200, invite.body)

const inviteRow = await db.query.staffInvites.findFirst({
  where: eq(staffInvites.employeeId, recepcao.id),
})
check('convite gravado com hash (token não fica em claro)', Boolean(inviteRow?.tokenHash))

// Substitui pelo hash de um token conhecido, para simular o clique no link.
const knownToken = randomBytes(32).toString('base64url')
await db
  .update(staffInvites)
  .set({ tokenHash: createHash('sha256').update(knownToken).digest('hex') })
  .where(eq(staffInvites.id, inviteRow!.id))

const inviteInfo = await app.inject({ method: 'GET', url: `/access/invite/${knownToken}` })
check('convite consultável sem login', inviteInfo.statusCode === 200, inviteInfo.body)
check('convite não vaza dado sensível', json(inviteInfo)?.email === STAFF_EMAIL)

const badInvite = await app.inject({ method: 'GET', url: `/access/invite/${randomBytes(32).toString('base64url')}` })
check('token forjado é rejeitado', badInvite.statusCode === 404)

const accept = await app.inject({
  method: 'POST',
  url: '/access/invite/accept',
  payload: { token: knownToken, password: PASSWORD, acceptedLegal: true },
})
check('aceite cria a conta e devolve sessão', accept.statusCode === 201, accept.body)
const staffToken = json(accept)?.token as string
check('sessão do funcionário não é dona', json(accept)?.user?.isOwner === false)

const reuse = await app.inject({
  method: 'POST',
  url: '/access/invite/accept',
  payload: { token: knownToken, password: PASSWORD, acceptedLegal: true },
})
check('convite é de uso único', reuse.statusCode === 404, reuse.body)

// --- 3. Gate de permissão --------------------------------------------------
const staffAgenda = await app.inject({
  method: 'GET',
  url: '/appointments?start=2026-01-01&end=2026-12-31',
  headers: auth(staffToken),
})
check('recepção lê a agenda', staffAgenda.statusCode === 200, staffAgenda.body)

const staffFinance = await app.inject({
  method: 'GET',
  url: '/transactions?start=2026-01-01&end=2026-12-31',
  headers: auth(staffToken),
})
check('recepção NÃO vê o financeiro', staffFinance.statusCode === 403, staffFinance.body)

const staffCreate = await app.inject({
  method: 'POST',
  url: '/appointments',
  headers: auth(staffToken),
  payload: {
    serviceId: '00000000-0000-0000-0000-000000000000',
    employeeId: profissional.id,
    date: '2026-12-01',
    startTime: '10:00',
    clientName: 'Fulano',
    clientPhone: '11999999999',
  },
})
check('recepção sem agenda.create é barrada ao criar', staffCreate.statusCode === 403, staffCreate.body)

const staffSettings = await app.inject({
  method: 'PUT',
  url: '/establishment',
  headers: auth(staffToken),
  payload: { name: 'Hackeado' },
})
check('recepção NÃO edita o estabelecimento', staffSettings.statusCode === 403, staffSettings.body)

// --- 3a. A fila de espera não é atalho para a agenda do colega --------------
// Sem `agenda.view_all`, encaixar tem que respeitar o mesmo escopo de criar:
// senão a fila vira um caminho de escrita paralelo, sem gate.
await db
  .update(employees)
  .set({ permissions: ['agenda.view', 'agenda.create'] })
  .where(eq(employees.id, recepcao.id))

const [servico] = await db
  .insert(services)
  .values({ establishmentId: est.id, name: 'Corte', durationMinutes: 30, priceCents: 5000 })
  .returning()
const [cliente] = await db
  .insert(clients)
  .values({ establishmentId: est.id, name: 'Cliente Teste', phone: '11988887777' })
  .returning()
const [entrada] = await db
  .insert(waitlistEntries)
  .values({
    establishmentId: est.id,
    clientId: cliente.id,
    serviceId: servico.id,
    targetDate: '2026-12-01',
  })
  .returning()

const promoteAlheio = await app.inject({
  method: 'POST',
  url: `/waitlist/${entrada.id}/promote`,
  headers: auth(staffToken),
  payload: { employeeId: profissional.id, startTime: '10:00' },
})
check(
  'encaixar na agenda de outro é barrado sem agenda.view_all',
  promoteAlheio.statusCode === 403,
  promoteAlheio.body,
)

const promoteProprio = await app.inject({
  method: 'POST',
  url: `/waitlist/${entrada.id}/promote`,
  headers: auth(staffToken),
  payload: { employeeId: recepcao.id, startTime: '10:00' },
})
check('encaixar na própria agenda funciona', promoteProprio.statusCode === 200, promoteProprio.body)

await db
  .update(employees)
  .set({ permissions: ['agenda.view', 'agenda.view_all', 'clients.view'] })
  .where(eq(employees.id, recepcao.id))

// --- 3b. Redação da folha na lista de profissionais -------------------------
await db
  .update(employees)
  .set({ salaryCents: 350000, commissionEnabled: true })
  .where(eq(employees.id, profissional.id))

const staffTeam = await app.inject({ method: 'GET', url: '/employees', headers: auth(staffToken) })
const staffRows = json(staffTeam) as { id: string; salaryCents: number | null; permissions: string[] }[]
const alvo = staffRows?.find((e) => e.id === profissional.id)
check('recepção lê a equipe (a agenda precisa)', staffTeam.statusCode === 200, staffTeam.body)
check('salário do colega NÃO vaza sem finance.payroll', alvo?.salaryCents === null, alvo)
check('permissões do colega NÃO vazam para quem não é dono', alvo?.permissions?.length === 0, alvo)

const ownerTeam = await app.inject({ method: 'GET', url: '/employees', headers: auth(ownerToken) })
const ownerAlvo = (json(ownerTeam) as typeof staffRows)?.find((e) => e.id === profissional.id)
check('dono continua vendo o salário', ownerAlvo?.salaryCents === 350000, ownerAlvo)

// Salvar a ficha sem enxergar a folha não pode apagar o salário do colega.
const staffSave = await app.inject({
  method: 'PUT',
  url: `/employees/${profissional.id}`,
  headers: auth(staffToken),
  payload: { name: 'Profissional Teste', salaryCents: null },
})
const depoisDoSave = await db.query.employees.findFirst({ where: eq(employees.id, profissional.id) })
check(
  'editar a ficha sem finance.payroll NÃO apaga o salário',
  staffSave.statusCode !== 200 || depoisDoSave?.salaryCents === 350000,
  { status: staffSave.statusCode, salario: depoisDoSave?.salaryCents },
)

// --- 4. Invariante do dono: nem admin gerencia acessos ----------------------
await db.update(employees).set({ permissions: ['admin'] }).where(eq(employees.id, recepcao.id))

const adminFinance = await app.inject({
  method: 'GET',
  url: '/transactions?start=2026-01-01&end=2026-12-31',
  headers: auth(staffToken),
})
check('com admin, o financeiro abre', adminFinance.statusCode === 200, adminFinance.body)

const adminAccess = await app.inject({
  method: 'PUT',
  url: `/access/employees/${profissional.id}/permissions`,
  headers: auth(staffToken),
  payload: { permissions: ['admin'] },
})
check('admin NÃO gerencia acessos da equipe', adminAccess.statusCode === 403, adminAccess.body)

const adminBilling = await app.inject({
  method: 'DELETE',
  url: '/establishment',
  headers: auth(staffToken),
})
check('admin NÃO exclui a conta', adminBilling.statusCode === 403, adminBilling.body)

const adminProfile = await app.inject({
  method: 'PUT',
  url: '/auth/me',
  headers: auth(staffToken),
  payload: { name: 'Dono Falso' },
})
check('admin NÃO edita os dados do dono', adminProfile.statusCode === 403, adminProfile.body)

const ownPassword = await app.inject({
  method: 'PUT',
  url: '/auth/me/password',
  headers: auth(staffToken),
  payload: { currentPassword: PASSWORD, newPassword: 'outrasenha123' },
})
check('qualquer sessão troca a PRÓPRIA senha', ownPassword.statusCode === 200, ownPassword.body)

// --- 5. Revogação vale na hora ---------------------------------------------
await db.update(employees).set({ active: false }).where(eq(employees.id, recepcao.id))
const afterDisable = await app.inject({
  method: 'GET',
  url: '/appointments?start=2026-01-01&end=2026-12-31',
  headers: auth(staffToken),
})
check('ficha desativada derruba o acesso no ato', afterDisable.statusCode === 401, afterDisable.body)

await db.update(employees).set({ active: true }).where(eq(employees.id, recepcao.id))

// O dono sai da agenda sem sair da conta: ficha inativa é "não atende", e é o
// que impede um gerente de trancar o dono para fora do próprio negócio.
await db.update(employees).set({ active: false }).where(eq(employees.id, ownerEmployee.id))
const ownerStillIn = await app.inject({
  method: 'GET',
  url: '/appointments?start=2026-01-01&end=2026-12-31',
  headers: auth(ownerToken),
})
check('dono com ficha inativa NÃO perde o acesso', ownerStillIn.statusCode === 200, ownerStillIn.body)
const ownerRelogin = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { email: OWNER_EMAIL, password: PASSWORD },
})
check('dono com ficha inativa ainda faz login', ownerRelogin.statusCode === 200, ownerRelogin.body)
await db.update(employees).set({ active: true }).where(eq(employees.id, ownerEmployee.id))

const revoke = await app.inject({
  method: 'DELETE',
  url: `/access/employees/${recepcao.id}/access`,
  headers: auth(ownerToken),
})
check('dono revoga o acesso', revoke.statusCode === 200, revoke.body)

const afterRevoke = await app.inject({
  method: 'GET',
  url: '/appointments?start=2026-01-01&end=2026-12-31',
  headers: auth(staffToken),
})
check('token antigo morre junto com o acesso', afterRevoke.statusCode === 401, afterRevoke.body)

const fichaViva = await db.query.employees.findFirst({ where: eq(employees.id, recepcao.id) })
check('revogar acesso NÃO apaga a ficha', Boolean(fichaViva) && fichaViva?.userId === null)

// --- 6. Link público ignora quem não atende --------------------------------
const publicPage = await app.inject({ method: 'GET', url: `/public/${est.slug}` })
const publicEmployees = (json(publicPage)?.employees ?? []) as { id: string }[]
check(
  'profissional não agendável fica fora do link público',
  publicPage.statusCode === 200 && !publicEmployees.some((e) => e.id === recepcao.id),
  publicEmployees,
)
check(
  'profissional agendável aparece no link público',
  publicEmployees.some((e) => e.id === profissional.id),
  publicEmployees,
)

// --- limpeza ---------------------------------------------------------------
await db.delete(establishments).where(eq(establishments.id, est.id))
await db.delete(users).where(eq(users.email, OWNER_EMAIL))
await db.delete(users).where(eq(users.email, STAFF_EMAIL))
await app.close()
await pool.end()

console.log(`\n${passed} passaram, ${failed} falharam`)
process.exit(failed > 0 ? 1 : 0)
