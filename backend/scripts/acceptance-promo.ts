/**
 * E2E do cupom promocional via app.inject, sem subir servidor e SEM tocar o
 * Asaas: exercita a rota pública da promo e todos os caminhos de recusa do
 * cupom, que por desenho falham antes de qualquer chamada ao gateway.
 * Cria um estabelecimento descartável e apaga tudo no fim.
 */
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app'
import { db, pool } from '../src/db'
import { employees, establishments, payments, subscriptions, users } from '../src/db/schema'

const SUFFIX = randomBytes(4).toString('hex')
const EMAIL = `promo.${SUFFIX}@teste.local`
const PASSWORD = 'senha123'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1
    console.log(`  ok    ${name}`)
  } else {
    failed += 1
    console.log(`  FALHA ${name}`, detail ?? '')
  }
}

const app = await buildApp()
const json = (r: { body: string }) => {
  try {
    return JSON.parse(r.body)
  } catch {
    return null
  }
}

const hash = await bcrypt.hash(PASSWORD, 10)
const [est] = await db
  .insert(establishments)
  .values({
    name: `Promo ${SUFFIX}`,
    slug: `promo-${SUFFIX}`,
    trialEndsAt: new Date(Date.now() + 10 * 86_400_000),
  })
  .returning()
const [ownerUser] = await db
  .insert(users)
  .values({ name: 'Dono Promo', email: EMAIL, passwordHash: hash })
  .returning()
await db
  .insert(employees)
  .values({ establishmentId: est.id, userId: ownerUser.id, name: 'Dono Promo', isOwner: true })

const login = await app.inject({
  method: 'POST',
  url: '/auth/login',
  payload: { email: EMAIL, password: PASSWORD },
})
const token = json(login)?.token as string
const auth = { authorization: `Bearer ${token}` }
check('dono faz login', login.statusCode === 200, login.body)

// --- 1. Rota pública da campanha -------------------------------------------
console.log('\n1. GET /payments/promo')
const promoRes = await app.inject({ method: 'GET', url: '/payments/promo' })
check('responde 200 sem autenticação', promoRes.statusCode === 200, promoRes.body)
check('devolve o cupom ativo', json(promoRes)?.code === 'BEMVINDO10', promoRes.body)
check('devolve o percentual', json(promoRes)?.percentOff === 10, promoRes.body)

// --- 2. Catálogo de planos não foi contaminado -----------------------------
console.log('\n2. GET /payments/plans (não pode ganhar chave nova)')
const plansRes = await app.inject({ method: 'GET', url: '/payments/plans' })
const planKeys = Object.keys(json(plansRes) ?? {}).sort()
check(
  'continua só com basico e essencial',
  JSON.stringify(planKeys) === JSON.stringify(['basico', 'essencial']),
  planKeys,
)

// --- 3. Recusas do cupom, todas ANTES de falar com o Asaas -----------------
// A chave do Asaas aqui é placeholder: se a validação deixasse passar, o erro
// seria de gateway (mensagem do Asaas), não a nossa mensagem de cupom.
const cardPayload = {
  planSlug: 'essencial',
  billingCycle: 'monthly',
  card: {
    holderName: 'TESTE PROMO',
    number: '5162306219378829',
    expiryMonth: '12',
    expiryYear: '2030',
    ccv: '318',
  },
  holder: {
    name: 'Dono Promo',
    email: EMAIL,
    cpfCnpj: '24971563792',
    postalCode: '01310100',
    addressNumber: '100',
    phone: '11999999999',
  },
}

console.log('\n3. POST /payments/subscribe com cupom inválido')
const badCoupon = await app.inject({
  method: 'POST',
  url: '/payments/subscribe',
  headers: auth,
  payload: { ...cardPayload, promoCode: 'NAOEXISTE99' },
})
check('recusa com 422', badCoupon.statusCode === 422, badCoupon.body)
check(
  'mensagem é a nossa, não a do gateway (falhou antes do Asaas)',
  String(json(badCoupon)?.message).includes('Cupom inválido'),
  badCoupon.body,
)

console.log('\n4. Cupom aceito normaliza caixa/espaço')
// Sem chave real do Asaas a assinatura não completa, mas o erro TEM que ser do
// gateway: isso prova que o cupom passou pela validação.
const goodCoupon = await app.inject({
  method: 'POST',
  url: '/payments/subscribe',
  headers: auth,
  payload: { ...cardPayload, promoCode: '  bemvindo10  ' },
})
check(
  'passa da validação do cupom e só então falha no gateway',
  goodCoupon.statusCode !== 422 || !String(json(goodCoupon)?.message).includes('Cupom'),
  `${goodCoupon.statusCode} ${goodCoupon.body}`,
)

// --- 5. Cupom recusado para quem já pagou ----------------------------------
console.log('\n5. Cupom para conta que já pagou alguma vez')
const [sub] = await db
  .insert(subscriptions)
  .values({
    establishmentId: est.id,
    planSlug: 'basico',
    billingCycle: 'monthly',
    status: 'canceled', // cancelada de propósito: isChange = false
    asaasCustomerId: 'cus_teste',
    asaasSubscriptionId: `sub_teste_${SUFFIX}`,
  })
  .returning()
await db.insert(payments).values({
  subscriptionId: sub.id,
  asaasPaymentId: `pay_teste_${SUFFIX}`,
  status: 'confirmed',
  amountCents: 8910,
  dueDate: '2026-01-01',
})

const reused = await app.inject({
  method: 'POST',
  url: '/payments/subscribe',
  headers: auth,
  payload: { ...cardPayload, promoCode: 'BEMVINDO10' },
})
check('recusa com 422', reused.statusCode === 422, reused.body)
check(
  'explica que vale só na primeira cobrança',
  String(json(reused)?.message).includes('primeira cobrança'),
  reused.body,
)

// --- 6. Cupom recusado em troca de plano (assinatura ativa) ----------------
console.log('\n6. Cupom com assinatura ATIVA (troca de plano)')
await db.update(subscriptions).set({ status: 'active' }).where(eq(subscriptions.id, sub.id))
const onChange = await app.inject({
  method: 'POST',
  url: '/payments/subscribe',
  headers: auth,
  payload: { ...cardPayload, promoCode: 'BEMVINDO10' },
})
check('recusa com 422', onChange.statusCode === 422, onChange.body)
check(
  'explica que não vale na troca de plano',
  String(json(onChange)?.message).includes('troca de plano'),
  onChange.body,
)

// --- 7. Sem cupom o fluxo antigo segue intacto -----------------------------
console.log('\n7. Assinatura SEM cupom não é afetada pela validação')
const noCoupon = await app.inject({
  method: 'POST',
  url: '/payments/subscribe',
  headers: auth,
  payload: cardPayload,
})
check(
  'não é barrada por regra de cupom',
  !String(json(noCoupon)?.message ?? '').toLowerCase().includes('cupom'),
  `${noCoupon.statusCode} ${noCoupon.body}`,
)

// --- limpeza ---------------------------------------------------------------
await db.delete(payments).where(eq(payments.subscriptionId, sub.id))
await db.delete(subscriptions).where(eq(subscriptions.establishmentId, est.id))
await db.delete(employees).where(eq(employees.establishmentId, est.id))
await db.delete(establishments).where(eq(establishments.id, est.id))
await db.delete(users).where(eq(users.id, ownerUser.id))

console.log(`\n${passed} ok, ${failed} falha(s)`)
await app.close()
await pool.end()
process.exit(failed === 0 ? 0 : 1)
