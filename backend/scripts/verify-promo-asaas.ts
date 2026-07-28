/**
 * Prova, contra o Asaas de SANDBOX, a premissa em que o desconto promocional se
 * apoia (ver lib/promos.ts e modules/payments/service.ts#subscribe):
 *
 *   criar a assinatura com o valor DESCONTADO e subir pro valor CHEIO logo em
 *   seguida deixa a cobrança #1 congelada no desconto, porque o Asaas
 *   materializa essa cobrança na criação e o update só afeta as futuras.
 *
 * Se isso não se confirmar, o "10% só na primeira cobrança" do plano mensal não
 * funciona e o desenho do ramo recorrente precisa mudar.
 *
 * Uso: npm run test:promo   (exige ASAAS_ENV=sandbox e uma chave de sandbox real)
 */
import { randomBytes } from 'node:crypto'
import { env } from '../src/env'
import {
  cancelAsaasSubscription,
  createCreditCardSubscription,
  findOrCreateCustomer,
  updateAsaasSubscription,
} from '../src/lib/asaasClient'
import { PLANS, centsToReais } from '../src/lib/plans'
import { ACTIVE_PROMO, applyPromoCents } from '../src/lib/promos'

// Trava dura: este script CRIA cobrança. Em produção seria dinheiro de verdade.
if (env.ASAAS_ENV !== 'sandbox') {
  console.error('Recusado: este script só roda com ASAAS_ENV=sandbox.')
  process.exit(1)
}

// Cartão de teste do Asaas (sandbox). Não é um cartão real.
const TEST_CARD = {
  holderName: 'TESTE PROMO',
  number: '5162306219378829',
  expiryMonth: '12',
  expiryYear: '2030',
  ccv: '318',
}

const SUFFIX = randomBytes(4).toString('hex')
const fullCents = PLANS.essencial.monthlyCents
const discountedCents = applyPromoCents(fullCents, ACTIVE_PROMO?.percentOff ?? 0)

console.log(`cupom ${ACTIVE_PROMO?.code}: ${centsToReais(fullCents)} → ${centsToReais(discountedCents)}\n`)

const customer = await findOrCreateCustomer({
  name: `Teste Promo ${SUFFIX}`,
  email: `promo.${SUFFIX}@teste.local`,
  // CPF de teste do Asaas sandbox.
  cpfCnpj: '24971563792',
  phone: '11999999999',
})

const subscription = await createCreditCardSubscription({
  customer: customer.id,
  cycle: 'MONTHLY',
  value: centsToReais(discountedCents),
  nextDueDate: new Date().toISOString().slice(0, 10),
  creditCard: TEST_CARD,
  creditCardHolderInfo: {
    name: `Teste Promo ${SUFFIX}`,
    email: `promo.${SUFFIX}@teste.local`,
    cpfCnpj: '24971563792',
    postalCode: '01310100',
    addressNumber: '100',
    phone: '11999999999',
  },
  remoteIp: '127.0.0.1',
})
console.log(`assinatura criada: ${subscription.id} (value ${subscription.value})`)

await updateAsaasSubscription(subscription.id, { value: centsToReais(fullCents), cycle: 'MONTHLY' })
console.log(`valor restaurado para ${centsToReais(fullCents)}\n`)

// Lê de volta a cobrança que o Asaas gerou na criação.
const listed = (await (
  await fetch(`https://api-sandbox.asaas.com/v3/subscriptions/${subscription.id}/payments`, {
    headers: { access_token: env.ASAAS_API_KEY },
  })
).json()) as { data?: { id: string; value: number; status: string }[] }

const charges = listed.data ?? []
console.log('cobranças geradas:', charges.map((c) => `${c.id} = ${c.value} (${c.status})`).join(', ') || '(nenhuma)')

const first = charges[0]
const expected = centsToReais(discountedCents)
const ok = charges.length === 1 && first?.value === expected

console.log(
  ok
    ? `\nPREMISSA CONFIRMADA: a cobrança #1 ficou em ${expected} e a assinatura em ${centsToReais(fullCents)}.`
    : `\nPREMISSA FALSA: esperava 1 cobrança de ${expected}. O ramo recorrente precisa ser reprojetado.`,
)

// Limpa o que foi criado (as cobranças pendentes vão junto).
await cancelAsaasSubscription(subscription.id)
console.log('assinatura de teste cancelada.')

process.exit(ok ? 0 : 1)
