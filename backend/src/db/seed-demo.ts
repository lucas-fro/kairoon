/**
 * Seed "estabelecimento real": limpa o banco e popula a Barbearia Navalha de
 * Ouro com 3 meses de operação natural: mês passado, mês atual e próximo mês
 * cheios de agendamentos, fechamentos, comissões, caixa, fidelidade e pontos.
 *
 * Rode com:  npm run db:seed:demo
 *
 * Toda a geração é feita em memória (ids gerados no cliente) e inserida em
 * ordem de dependência (FK) ao final, em lotes. Reproduzível: usa um PRNG com
 * semente fixa, então o resultado é o mesmo a cada execução.
 */
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { sql } from 'drizzle-orm'
import {
  addDays,
  addMinutesToTime,
  endOfMonth,
  getDayOfWeek,
  minutesToTime,
  nowMinutes,
  timeToMinutes,
  toDateStr,
  todayStr,
} from '../lib/datetime'
import { db, pool } from './index'
import * as schema from './schema'

// ---------------------------------------------------------------------------
// PRNG determinístico (mulberry32) + helpers de sorteio
// ---------------------------------------------------------------------------
let _seed = 0x9e3779b9
function rand(): number {
  _seed |= 0
  _seed = (_seed + 0x6d2b79f5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const chance = (p: number) => rand() < p
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}
function weighted<T>(pairs: readonly (readonly [T, number])[]): T {
  const total = pairs.reduce((a, [, w]) => a + w, 0)
  let roll = rand() * total
  for (const [value, w] of pairs) {
    roll -= w
    if (roll < 0) return value
  }
  return pairs[pairs.length - 1][0]
}

// ---------------------------------------------------------------------------
// Datas de referência (derivadas de hoje)
// ---------------------------------------------------------------------------
const today = todayStr()
const [tYear, tMonth] = today.split('-').map(Number)
const prevMonthStart = toDateStr(new Date(tYear, tMonth - 2, 1))
const nextMonthStart = toDateStr(new Date(tYear, tMonth, 1))
const rangeStart = prevMonthStart
const rangeEnd = endOfMonth(nextMonthStart)
const nowMin = nowMinutes()

// Dois feriados de dia inteiro (agenda fechada): um no mês passado, um no futuro.
function weekdayNear(base: string, offset: number): string {
  let d = addDays(base, offset)
  if (getDayOfWeek(d) === 0) d = addDays(d, 1)
  return d
}
const holidayPast = weekdayNear(prevMonthStart, 17)
const holidayFuture = weekdayNear(nextMonthStart, 14)
const holidays = new Set([holidayPast, holidayFuture])

// ---------------------------------------------------------------------------
// IDs gerados no cliente (permite montar tudo em memória antes do insert)
// ---------------------------------------------------------------------------
const id = () => randomUUID()

const userId = id()
const estId = id()

type EmpKey = 'carlos' | 'rafael' | 'marina' | 'diego'
const empId: Record<EmpKey, string> = { carlos: id(), rafael: id(), marina: id(), diego: id() }

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------
interface SvcDef {
  key: string
  name: string
  durationMinutes: number
  priceCents: number
  active?: boolean
  isPackage?: boolean
  packageKeys?: string[]
  packageDiscountType?: 'percent' | 'fixed'
  packageDiscountValue?: number
}
const svcDefs: SvcDef[] = [
  { key: 'corte', name: 'Corte Masculino', durationMinutes: 30, priceCents: 4500 },
  { key: 'barba', name: 'Barba Completa', durationMinutes: 30, priceCents: 3500 },
  { key: 'cortebarba', name: 'Corte + Barba', durationMinutes: 60, priceCents: 7000 },
  { key: 'pezinho', name: 'Pezinho (Acabamento)', durationMinutes: 15, priceCents: 1500 },
  { key: 'sobrancelha', name: 'Sobrancelha', durationMinutes: 15, priceCents: 1500 },
  { key: 'luzes', name: 'Luzes / Descoloração', durationMinutes: 90, priceCents: 12000 },
  { key: 'platinado', name: 'Platinado Global', durationMinutes: 120, priceCents: 18000 },
  { key: 'relax', name: 'Relaxamento Capilar', durationMinutes: 60, priceCents: 8000, active: false },
]
const svcId: Record<string, string> = {}
for (const s of svcDefs) svcId[s.key] = id()
// Pacote (combo): calculado a partir dos itens
const comboKeys = ['corte', 'barba', 'sobrancelha']
const comboSum = comboKeys.reduce((a, k) => a + svcDefs.find((s) => s.key === k)!.priceCents, 0)
const comboDur = comboKeys.reduce((a, k) => a + svcDefs.find((s) => s.key === k)!.durationMinutes, 0)
const comboDiscountPct = 15
const comboPrice = comboSum - Math.round((comboSum * comboDiscountPct) / 100)
svcId['combo'] = id()

interface Svc {
  id: string
  key: string
  name: string
  durationMinutes: number
  priceCents: number
}
const svcByKey: Record<string, Svc> = {}
for (const s of svcDefs) {
  svcByKey[s.key] = {
    id: svcId[s.key],
    key: s.key,
    name: s.name,
    durationMinutes: s.durationMinutes,
    priceCents: s.priceCents,
  }
}
svcByKey['combo'] = {
  id: svcId['combo'],
  key: 'combo',
  name: 'Combo Completo (Corte + Barba + Sobrancelha)',
  durationMinutes: comboDur,
  priceCents: comboPrice,
}

// ---------------------------------------------------------------------------
// Funcionários (jornada + comissão por serviço + folha)
// ---------------------------------------------------------------------------
interface EmpDef {
  key: EmpKey
  name: string
  email: string
  phone: string
  birthDate: string
  gender: string
  workStart: string
  workEnd: string
  lunchStart: string | null
  lunchEnd: string | null
  workDays: number[]
  salaryCents: number
  commissions: Record<string, number> // svcKey -> percent
  serviceWeights: (readonly [string, number])[]
}
const empDefs: EmpDef[] = [
  {
    key: 'carlos',
    name: 'Carlos Andrade',
    email: 'carlos.andrade@navalhadeouro.com',
    phone: '11991234567',
    birthDate: '1990-05-14',
    gender: 'masculino',
    workStart: '09:00',
    workEnd: '19:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    workDays: [1, 2, 3, 4, 5, 6],
    salaryCents: 200000,
    commissions: { corte: 40, barba: 40, cortebarba: 45, pezinho: 50, sobrancelha: 50 },
    serviceWeights: [
      ['corte', 40],
      ['cortebarba', 24],
      ['barba', 14],
      ['pezinho', 8],
      ['sobrancelha', 7],
      ['combo', 4],
    ],
  },
  {
    key: 'rafael',
    name: 'Rafael Nunes',
    email: 'rafael.nunes@navalhadeouro.com',
    phone: '11990001111',
    birthDate: '1988-08-20',
    gender: 'masculino',
    workStart: '10:00',
    workEnd: '19:00',
    lunchStart: '13:00',
    lunchEnd: '14:00',
    workDays: [1, 2, 3, 4, 5, 6],
    salaryCents: 180000,
    commissions: { corte: 35, barba: 35, cortebarba: 40, pezinho: 45, sobrancelha: 45 },
    serviceWeights: [
      ['corte', 42],
      ['cortebarba', 20],
      ['barba', 16],
      ['pezinho', 9],
      ['sobrancelha', 8],
      ['combo', 3],
    ],
  },
  {
    key: 'marina',
    name: 'Marina Alves',
    email: 'marina.alves@navalhadeouro.com',
    phone: '11990002222',
    birthDate: '1995-02-11',
    gender: 'feminino',
    workStart: '09:00',
    workEnd: '18:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    workDays: [2, 3, 4, 5, 6],
    salaryCents: 170000,
    commissions: {
      corte: 35,
      barba: 35,
      cortebarba: 40,
      sobrancelha: 50,
      luzes: 30,
      platinado: 30,
    },
    // A colorista: única que faz luzes/platinado
    serviceWeights: [
      ['corte', 26],
      ['cortebarba', 16],
      ['sobrancelha', 14],
      ['luzes', 16],
      ['platinado', 8],
      ['barba', 10],
      ['combo', 4],
    ],
  },
  {
    key: 'diego',
    name: 'Diego Ramos',
    email: 'diego.ramos@navalhadeouro.com',
    phone: '11990003333',
    birthDate: '1992-11-30',
    gender: 'masculino',
    workStart: '08:00',
    workEnd: '17:00',
    lunchStart: '12:00',
    lunchEnd: '13:00',
    workDays: [1, 2, 3, 4, 5],
    salaryCents: 160000,
    commissions: { corte: 30, barba: 30, cortebarba: 35, pezinho: 40, sobrancelha: 40 },
    serviceWeights: [
      ['corte', 44],
      ['cortebarba', 18],
      ['barba', 16],
      ['pezinho', 10],
      ['sobrancelha', 8],
      ['combo', 4],
    ],
  },
]
const empByKey = new Map(empDefs.map((e) => [e.key, e]))

// Horário de funcionamento do estabelecimento por dia da semana
const estHours: Record<number, { opensAt: string; closesAt: string; isClosed: boolean }> = {
  0: { opensAt: '09:00', closesAt: '18:00', isClosed: true },
  1: { opensAt: '09:00', closesAt: '19:00', isClosed: false },
  2: { opensAt: '09:00', closesAt: '19:00', isClosed: false },
  3: { opensAt: '09:00', closesAt: '19:00', isClosed: false },
  4: { opensAt: '09:00', closesAt: '19:00', isClosed: false },
  5: { opensAt: '09:00', closesAt: '19:00', isClosed: false },
  6: { opensAt: '09:00', closesAt: '18:00', isClosed: false },
}

// ---------------------------------------------------------------------------
// Produtos (estoque com decremento pelas vendas passadas)
// ---------------------------------------------------------------------------
interface ProdDef {
  key: string
  name: string
  brand: string
  priceCents: number
  costCents: number
  startStock: number
  sku: string
}
const prodDefs: ProdDef[] = [
  { key: 'pomada', name: 'Pomada Modeladora', brand: 'Don Alcides', priceCents: 3500, costCents: 1800, startStock: 60, sku: 'POM-001' },
  { key: 'shampoo', name: 'Shampoo Anticaspa', brand: 'QOD Barber', priceCents: 2800, costCents: 1500, startStock: 45, sku: 'SHP-002' },
  { key: 'oleo', name: 'Óleo para Barba', brand: 'Viking', priceCents: 4200, costCents: 2200, startStock: 30, sku: 'OLE-003' },
  { key: 'minoxidil', name: 'Minoxidil 5%', brand: 'Kirkland', priceCents: 6900, costCents: 3900, startStock: 24, sku: 'MIN-004' },
  { key: 'cera', name: 'Cera Fixadora', brand: 'Bem Barba', priceCents: 3200, costCents: 1600, startStock: 20, sku: 'CER-005' },
  { key: 'grooming', name: 'Kit Grooming Completo', brand: 'Navalha de Ouro', priceCents: 8900, costCents: 4800, startStock: 12, sku: 'KIT-006' },
]
const prodId: Record<string, string> = {}
for (const p of prodDefs) prodId[p.key] = id()
const stockLeft: Record<string, number> = {}
for (const p of prodDefs) stockLeft[p.key] = p.startStock

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
const firstNamesM = [
  'Fernando', 'Rafael', 'Bruno', 'Diego', 'Marcos', 'Thiago', 'André', 'Gabriel',
  'Lucas', 'Pedro', 'João', 'Rodrigo', 'Felipe', 'Gustavo', 'Leonardo', 'Matheus',
  'Vinícius', 'Ricardo', 'Eduardo', 'Daniel', 'Caio', 'Henrique', 'Igor', 'Otávio',
  'Renato', 'Sérgio', 'Alexandre', 'Fábio', 'Márcio', 'Wesley',
]
const firstNamesF = ['Juliana', 'Camila', 'Patrícia', 'Aline', 'Beatriz', 'Larissa', 'Natália', 'Bianca']
const lastNames = [
  'Costa', 'Almeida', 'Santos', 'Pereira', 'Oliveira', 'Rocha', 'Souza', 'Martins',
  'Ferreira', 'Lima', 'Gomes', 'Ribeiro', 'Carvalho', 'Barbosa', 'Araújo', 'Cardoso',
  'Nascimento', 'Moreira', 'Teixeira', 'Correia',
]

interface ClientRow {
  id: string
  establishmentId: string
  name: string
  phone: string
  email: string | null
  birthDate: string | null
  gender: string | null
  createdAt: Date
}
const clients: ClientRow[] = []
const usedPhones = new Set<string>()
function makePhone(): string {
  let p: string
  do {
    p = '119' + String(randInt(10000000, 99999999))
  } while (usedPhones.has(p))
  usedPhones.add(p)
  return p
}
const CLIENT_COUNT = 52
for (let i = 0; i < CLIENT_COUNT; i++) {
  const female = i % 9 === 4 // ~11% mulheres
  const first = female ? pick(firstNamesF) : firstNamesM[i % firstNamesM.length]
  const name = `${first} ${pick(lastNames)}`
  // Cadastro espalhado: metade "antiga" (até 10 meses atrás), metade recente
  const monthsAgo = chance(0.5) ? randInt(3, 10) : randInt(0, 2)
  const created = new Date(tYear, tMonth - 1 - monthsAgo, randInt(1, 28), randInt(8, 19), randInt(0, 59))
  clients.push({
    id: id(),
    establishmentId: estId,
    name,
    phone: makePhone(),
    email: chance(0.55) ? `${first.toLowerCase()}.${randInt(1, 999)}@email.com` : null,
    birthDate: chance(0.6)
      ? toDateStr(new Date(randInt(1980, 2003), randInt(0, 11), randInt(1, 28)))
      : null,
    gender: female ? 'feminino' : 'masculino',
    createdAt: created,
  })
}
// Regulares: primeiros 22 clientes têm um barbeiro preferido e vêm com frequência
const regulars = clients.slice(0, 22)
const empKeysActive: EmpKey[] = ['carlos', 'rafael', 'marina', 'diego']
const preferredEmp = new Map<string, EmpKey>()
regulars.forEach((c, i) => preferredEmp.set(c.id, empKeysActive[i % empKeysActive.length]))

// ---------------------------------------------------------------------------
// Cupons manuais + campanha (definições)
// ---------------------------------------------------------------------------
const couponVolta10Id = id()
const couponBarba5Id = id()
const couponCampanhaId = id()

// ---------------------------------------------------------------------------
// Programas de fidelidade e pontos
// ---------------------------------------------------------------------------
const LOYALTY_STAMPS_REQUIRED = 10
const LOYALTY_MIN_TICKET = 2000
// Recompensa do cartão vale para Corte OU Barba (demonstra 1+ serviços)
const LOYALTY_REWARD_SERVICE_IDS = [svcId['corte'], svcId['barba']]
const POINTS_PER_SERVICE = 10
const POINTS_PER_CURRENCY = 1 // 1 ponto a cada R$1 do fechamento
const pointsReward300Id = id()
const pointsReward600Id = id()
const pointsReward1000Id = id()

// ---------------------------------------------------------------------------
// Acumuladores das linhas a inserir
// ---------------------------------------------------------------------------
type AppointmentRow = typeof schema.appointments.$inferInsert
type TransactionRow = typeof schema.transactions.$inferInsert
type CommissionRow = typeof schema.commissionEntries.$inferInsert
type StampRow = typeof schema.loyaltyStamps.$inferInsert & { id: string; clientId: string }
type PointsRow = typeof schema.pointsEntries.$inferInsert
type CouponRedRow = typeof schema.couponRedemptions.$inferInsert

const appointmentRows: AppointmentRow[] = []
const transactionRows: TransactionRow[] = []
const commissionRows: CommissionRow[] = []
const stampRows: StampRow[] = []
const pointsRows: PointsRow[] = []
const couponRedemptionRows: CouponRedRow[] = []

// Estatística rápida para o relatório final
let countCompleted = 0
let countConfirmed = 0
let countCancelled = 0
let countPending = 0

// Fidelidade: simulação cronológica do cartão. Carimba até o limite e para;
// ao completar o cartão o cliente costuma resgatar (corte grátis), o que
// consome os 10 carimbos e libera o cartão para acumular de novo. Assim os
// carimbos disponíveis nunca passam de LOYALTY_STAMPS_REQUIRED.
const mintedCoupons: (typeof schema.coupons.$inferInsert)[] = []
const loyaltyRedemptionRows: (typeof schema.loyaltyRedemptions.$inferInsert)[] = []
const openStampsByClient = new Map<string, StampRow[]>()
function redeemLoyaltyCard(clientId: string, cardStamps: StampRow[]) {
  const couponId = id()
  const redemptionId = id()
  mintedCoupons.push({
    id: couponId,
    establishmentId: estId,
    clientId,
    source: 'loyalty',
    name: 'Recompensa do cartão fidelidade',
    code: `FID-${String(randInt(100000, 999999))}`,
    discountType: 'free_service',
    discountValue: 0,
    appliesTo: 'service',
    appliesToServiceIds: LOYALTY_REWARD_SERVICE_IDS,
    maxUses: 1,
    usesPerClient: 1,
    autoApply: false,
    active: true,
  })
  loyaltyRedemptionRows.push({
    id: redemptionId,
    establishmentId: estId,
    clientId,
    stampsSpent: LOYALTY_STAMPS_REQUIRED,
    couponId,
    rewardType: 'free_service',
    rewardValue: 0,
    rewardServiceIds: LOYALTY_REWARD_SERVICE_IDS,
  })
  for (const s of cardStamps.slice(0, LOYALTY_STAMPS_REQUIRED)) s.redemptionId = redemptionId
}

// ---------------------------------------------------------------------------
// Geração dos agendamentos (dia a dia, funcionário a funcionário)
// ---------------------------------------------------------------------------
type Payment = { method: 'cash' | 'pix' | 'debit' | 'credit'; installments: number | null; amountCents: number }

function buildPayments(collected: number): Payment[] {
  if (collected <= 0) return []
  if (collected > 4000 && chance(0.12)) {
    const half = Math.round(collected / 2 / 100) * 100
    return [
      { method: 'cash', installments: null, amountCents: half },
      { method: 'pix', installments: null, amountCents: collected - half },
    ]
  }
  const method = weighted([
    ['pix', 45],
    ['credit', 25],
    ['debit', 20],
    ['cash', 10],
  ] as const)
  const installments = method === 'credit' ? (collected > 6000 ? pick([1, 2, 2, 3]) : 1) : null
  return [{ method, installments, amountCents: collected }]
}

// ocupação-base por dia da semana (chance de reservar cada passo da agenda)
const occByDow: Record<number, number> = { 1: 0.5, 2: 0.55, 3: 0.6, 4: 0.68, 5: 0.85, 6: 0.9 }

function chooseClientFor(empKey: EmpKey): ClientRow {
  // 65% um regular (preferindo os que têm esse barbeiro), senão qualquer cliente
  if (chance(0.65)) {
    const mine = regulars.filter((c) => preferredEmp.get(c.id) === empKey)
    if (mine.length && chance(0.7)) return pick(mine)
    return pick(regulars)
  }
  return pick(clients)
}

for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) {
  const dow = getDayOfWeek(date)
  if (estHours[dow].isClosed) continue
  if (holidays.has(date)) continue

  const isPastDay = date < today
  const isToday = date === today
  const isFuture = date > today
  // Agosto (mês que vem) um pouco menos cheio que o resto, mas ainda cheio
  const monthFactor = date >= nextMonthStart ? 0.82 : 1

  for (const emp of empDefs) {
    if (!emp.workDays.includes(dow)) continue

    const hours = estHours[dow]
    let cursor = Math.max(timeToMinutes(emp.workStart), timeToMinutes(hours.opensAt))
    const winEnd = Math.min(timeToMinutes(emp.workEnd), timeToMinutes(hours.closesAt))
    const lunchS = emp.lunchStart ? timeToMinutes(emp.lunchStart) : null
    const lunchE = emp.lunchEnd ? timeToMinutes(emp.lunchEnd) : null
    const occ = Math.min(0.95, (occByDow[dow] ?? 0.5) * monthFactor + (rand() - 0.5) * 0.1)

    while (cursor < winEnd) {
      // Pula o almoço
      if (lunchS != null && lunchE != null && cursor >= lunchS && cursor < lunchE) {
        cursor = lunchE
        continue
      }
      const boundary = lunchS != null && cursor < lunchS ? lunchS : winEnd
      const maxDur = boundary - cursor
      if (maxDur < 15) {
        cursor = boundary === lunchS ? (lunchE as number) : winEnd
        continue
      }
      if (!chance(occ)) {
        cursor += 15
        continue
      }
      // Escolhe um serviço que caiba na janela restante
      const fitting = emp.serviceWeights.filter(([k]) => svcByKey[k].durationMinutes <= maxDur)
      if (fitting.length === 0) {
        cursor += 15
        continue
      }
      const svcKey = weighted(fitting)
      const svc = svcByKey[svcKey]
      const startMin = cursor
      const endMin = startMin + svc.durationMinutes
      const startTime = minutesToTime(startMin)
      const endTime = minutesToTime(endMin)
      cursor = endMin + pick([0, 0, 0, 15, 15, 30]) // pequena folga natural

      // Status conforme a data/hora
      let status: 'completed' | 'confirmed' | 'cancelled' | 'pending'
      const createdVia: 'panel' | 'public' = chance(0.42) ? 'public' : 'panel'
      if (isPastDay) {
        status = chance(0.06) ? 'cancelled' : 'completed'
      } else if (isToday) {
        if (startMin < nowMin) status = chance(0.05) ? 'cancelled' : 'completed'
        else status = createdVia === 'public' && chance(0.12) ? 'pending' : 'confirmed'
      } else {
        const r = rand()
        if (r < 0.05) status = 'cancelled'
        else if (r < 0.13 && createdVia === 'public') status = 'pending'
        else status = 'confirmed'
      }

      const client = chooseClientFor(emp.key)
      const apptId = id()

      // Fechamento (só concluídos geram caixa/comissão/fidelidade/pontos)
      let discountCents = 0
      let payments: Payment[] | null = null
      let saleProducts:
        | { productId: string; name: string; quantity: number; unitPriceCents: number }[]
        | null = null
      let saleServices:
        | { serviceId: string; name: string; quantity: number; unitPriceCents: number }[]
        | null = null
      let debtCents = 0
      let tipCents = 0

      if (status === 'completed') {
        countCompleted++
        const base = svc.priceCents
        let extra = 0
        let prod = 0

        // Serviço extra junto (ex.: sobrancelha no corte)
        if (svcKey !== 'combo' && chance(0.14)) {
          const addonKey = pick(['sobrancelha', 'pezinho', 'barba'] as const)
          if (addonKey !== svcKey) {
            const addon = svcByKey[addonKey]
            saleServices = [
              { serviceId: addon.id, name: addon.name, quantity: 1, unitPriceCents: addon.priceCents },
            ]
            extra += addon.priceCents
          }
        }
        // Venda de produto no balcão (se houver estoque)
        if (chance(0.12)) {
          const available = prodDefs.filter((p) => stockLeft[p.key] > 0)
          if (available.length) {
            const p = pick(available)
            stockLeft[p.key] -= 1
            saleProducts = [
              { productId: prodId[p.key], name: p.name, quantity: 1, unitPriceCents: p.priceCents },
            ]
            prod += p.priceCents
          }
        }

        const subtotal = base + extra + prod

        // Cupom manual VOLTA10 em uma fração dos fechamentos passados
        if (chance(0.05)) {
          discountCents = Math.round(subtotal * 0.1)
          couponRedemptionRows.push({
            establishmentId: estId,
            couponId: couponVolta10Id,
            clientId: client.id,
            appointmentId: apptId,
            discountCents,
          })
        }

        const finalCents = Math.max(0, subtotal - discountCents)

        // Gorjeta / fiado (dívida): casos naturais
        const roll = rand()
        let collected = finalCents
        if (roll < 0.08) {
          tipCents = pick([200, 300, 500, 500, 1000])
          collected = finalCents + tipCents
        } else if (roll < 0.11) {
          debtCents = Math.min(finalCents, pick([1000, 1500, 2000, 2500]))
          collected = finalCents - debtCents
        }

        payments = buildPayments(collected)
        const txDate = date // concluído nunca é futuro

        if (collected > 0) {
          transactionRows.push({
            establishmentId: estId,
            appointmentId: apptId,
            description: `Serviço: ${svc.name} · ${client.name}`,
            amountCents: collected,
            type: 'income',
            date: txDate,
          })
        }

        // Comissão do barbeiro pelo serviço (base = preço do serviço)
        const pct = emp.commissions[svcKey]
        if (pct && pct > 0) {
          commissionRows.push({
            establishmentId: estId,
            appointmentId: apptId,
            employeeId: empId[emp.key],
            serviceId: svc.id,
            date: txDate,
            baseCents: base,
            commissionType: 'percent',
            commissionValue: pct,
            commissionCents: Math.round((base * pct) / 100),
          })
        }

        // Carimbo de fidelidade (respeita o ticket mínimo e o limite do cartão)
        if (finalCents >= LOYALTY_MIN_TICKET) {
          const open = openStampsByClient.get(client.id) ?? []
          if (open.length < LOYALTY_STAMPS_REQUIRED) {
            const stamp: StampRow = {
              id: id(),
              establishmentId: estId,
              clientId: client.id,
              appointmentId: apptId,
            }
            stampRows.push(stamp)
            open.push(stamp)
            openStampsByClient.set(client.id, open)
            // Cartão completou: costuma resgatar na hora (mas nem sempre)
            if (open.length === LOYALTY_STAMPS_REQUIRED && chance(0.7)) {
              redeemLoyaltyCard(client.id, open)
              openStampsByClient.set(client.id, [])
            }
          }
          // Cartão cheio e ainda não resgatado: não carimba (nunca passa do limite)
        }

        // Pontos ganhos no fechamento
        const earned = POINTS_PER_SERVICE + Math.floor(finalCents / 100) * POINTS_PER_CURRENCY
        if (earned > 0) {
          pointsRows.push({
            establishmentId: estId,
            clientId: client.id,
            appointmentId: apptId,
            type: 'earn',
            points: earned,
          })
        }
      } else if (status === 'confirmed') {
        countConfirmed++
      } else if (status === 'pending') {
        countPending++
      } else {
        countCancelled++
      }

      appointmentRows.push({
        id: apptId,
        establishmentId: estId,
        clientId: client.id,
        serviceId: svc.id,
        employeeId: empId[emp.key],
        date,
        startTime,
        endTime,
        status,
        createdVia,
        discountCents,
        payments,
        saleProducts,
        saleServices,
        debtCents,
        tipCents,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Resgate de pontos (os resgates de fidelidade já ocorreram no laço acima)
// ---------------------------------------------------------------------------
// Pontos: 1 cliente resgata o nível de 600 pontos (desconto fixo)
const pointsByClient = new Map<string, number>()
for (const p of pointsRows) {
  pointsByClient.set(p.clientId, (pointsByClient.get(p.clientId) ?? 0) + (p.points as number))
}
const pointsCandidate = [...pointsByClient.entries()]
  .filter(([, pts]) => pts >= 600)
  .sort((a, b) => b[1] - a[1])[0]
if (pointsCandidate) {
  const [clientId] = pointsCandidate
  const couponId = id()
  mintedCoupons.push({
    id: couponId,
    establishmentId: estId,
    clientId,
    source: 'points',
    name: 'R$ 15 de desconto (600 pontos)',
    code: `PTS-${String(randInt(100000, 999999))}`,
    discountType: 'fixed',
    discountValue: 1500,
    appliesTo: 'total',
    maxUses: 1,
    usesPerClient: 1,
    autoApply: false,
    active: true,
  })
  pointsRows.push({
    establishmentId: estId,
    clientId,
    appointmentId: null,
    rewardId: pointsReward600Id,
    type: 'redeem',
    points: -600,
    couponId,
  })
}

// ---------------------------------------------------------------------------
// Custos fixos + lançamentos de caixa (despesas) do mês passado e atual
// ---------------------------------------------------------------------------
const recExpAluguelId = id()
const recExpEnergiaId = id()
const recExpAguaId = id()
const recExpInternetId = id()
const recExpContadorId = id()

const recurringExpenseRows: (typeof schema.recurringExpenses.$inferInsert)[] = [
  { id: recExpAluguelId, establishmentId: estId, description: 'Aluguel do espaço', amountCents: 320000, dayOfMonth: 5 },
  { id: recExpEnergiaId, establishmentId: estId, description: 'Energia elétrica', amountCents: 42000, dayOfMonth: 10 },
  { id: recExpAguaId, establishmentId: estId, description: 'Água', amountCents: 9000, dayOfMonth: 10 },
  { id: recExpInternetId, establishmentId: estId, description: 'Internet + telefone', amountCents: 15000, dayOfMonth: 15 },
  { id: recExpContadorId, establishmentId: estId, description: 'Contador', amountCents: 40000, dayOfMonth: 10 },
]

// Baixa de um custo fixo em um mês (respeita o dia; só lança se já venceu)
function bookRecurring(recId: string, description: string, amountCents: number, dayOfMonth: number, monthStart: string) {
  const dateStr = `${monthStart.slice(0, 7)}-${String(dayOfMonth).padStart(2, '0')}`
  if (dateStr > today) return // ainda não venceu
  transactionRows.push({
    establishmentId: estId,
    recurringExpenseId: recId,
    description,
    amountCents,
    type: 'expense',
    date: dateStr,
  })
}
// Lança o mês passado (todos vencidos) e o atual (os que já venceram)
for (const ms of [prevMonthStart, today.slice(0, 7) + '-01']) {
  bookRecurring(recExpAluguelId, 'Aluguel do espaço', 320000, 5, ms)
  bookRecurring(recExpEnergiaId, 'Energia elétrica', 42000 + randInt(-4000, 6000), 10, ms)
  bookRecurring(recExpAguaId, 'Água', 9000 + randInt(-1500, 2000), 10, ms)
  bookRecurring(recExpInternetId, 'Internet + telefone', 15000, 15, ms)
  bookRecurring(recExpContadorId, 'Contador', 40000, 10, ms)
}

// Folha: salário de cada barbeiro no dia 5 (mês passado + atual se já passou)
for (const ms of [prevMonthStart, today.slice(0, 7) + '-01']) {
  const payDate = `${ms.slice(0, 7)}-05`
  if (payDate > today) continue
  for (const emp of empDefs) {
    transactionRows.push({
      establishmentId: estId,
      employeeId: empId[emp.key],
      payrollDay: 5,
      description: `Salário de ${emp.name}`,
      amountCents: emp.salaryCents,
      type: 'expense',
      date: payDate,
    })
  }
}

// Compras avulsas de insumos/estoque ao longo dos meses
const adhocExpenses = [
  { desc: 'Reposição de lâminas e descartáveis', cents: 28000, off: -22 },
  { desc: 'Compra de pomadas e ceras (fornecedor)', cents: 45000, off: -15 },
  { desc: 'Manutenção do ar-condicionado', cents: 22000, off: -9 },
  { desc: 'Material de limpeza', cents: 12000, off: -5 },
  { desc: 'Reposição de toalhas', cents: 18000, off: -2 },
]
for (const e of adhocExpenses) {
  const d = addDays(today, e.off)
  if (d < rangeStart) continue
  transactionRows.push({
    establishmentId: estId,
    description: e.desc,
    amountCents: e.cents,
    type: 'expense',
    date: d,
  })
}

// ---------------------------------------------------------------------------
// Fila de espera (para o próximo sábado cheio) + observação
// ---------------------------------------------------------------------------
// Próximo sábado a partir de hoje
let nextSat = today
for (let i = 0; i < 7; i++) {
  const d = addDays(today, i)
  if (getDayOfWeek(d) === 6) {
    nextSat = d
    break
  }
}
const waitlistRows: (typeof schema.waitlistEntries.$inferInsert)[] = []
for (let i = 0; i < 3; i++) {
  const c = pick(regulars)
  waitlistRows.push({
    establishmentId: estId,
    clientId: c.id,
    serviceId: svcByKey[pick(['corte', 'cortebarba', 'barba'] as const)].id,
    preferredEmployeeId: chance(0.6) ? empId[pick(empKeysActive)] : null,
    targetDate: nextSat,
    note: pick(['Encaixe se abrir vaga', 'Cliente pediu pra avisar', 'Prefere fim da tarde']),
    status: 'waiting',
  })
}

// ---------------------------------------------------------------------------
// Bloqueios de agenda (os dois feriados de dia inteiro)
// ---------------------------------------------------------------------------
const timeBlockRows: (typeof schema.timeBlocks.$inferInsert)[] = [
  // Pausas gerais do estabelecimento (employeeId null = todos os profissionais).
  { establishmentId: estId, date: holidayPast, reason: 'Feriado: barbearia fechada' },
  { establishmentId: estId, date: holidayFuture, reason: 'Feriado: barbearia fechada' },
  // Folga da tarde só de um profissional (bloqueio específico do Rafael).
  {
    establishmentId: estId,
    employeeId: empId.rafael,
    date: weekdayNear(nextMonthStart, 21),
    startTime: '13:00',
    endTime: '19:00',
    reason: 'Rafael: folga da tarde',
  },
]

// ===========================================================================
// PERSISTÊNCIA
// ===========================================================================
async function insertAll<T>(table: any, rows: T[], chunkSize = 400) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(table).values(rows.slice(i, i + chunkSize) as any)
  }
}

async function wipeDatabase() {
  // TRUNCATE de tudo, reiniciando e cascateando. Banco limpo de verdade.
  const tables = [
    'points_entries', 'points_rewards', 'points_programs',
    'loyalty_stamps', 'loyalty_redemptions', 'loyalty_programs',
    'coupon_redemptions', 'coupons',
    'commission_entries', 'transactions', 'recurring_expenses',
    'waitlist_entries', 'appointments', 'time_blocks',
    'employee_commissions', 'employees', 'services', 'products',
    'clients', 'working_hours', 'establishments', 'users',
  ]
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`))
}

async function main() {
  console.log('Limpando o banco de dados…')
  await wipeDatabase()

  console.log('Criando estabelecimento, equipe, serviços e catálogo…')
  const passwordHash = await bcrypt.hash('admin123', 10)
  await db.insert(schema.users).values({
    id: userId,
    name: 'Lucas Oliveira',
    email: 'admin@barbearia.com',
    passwordHash,
    cpf: '123.456.789-09',
    phone: '11987654321',
    birthDate: '1989-07-22',
  })

  await db.insert(schema.establishments).values({
    id: estId,
    ownerId: userId,
    name: 'Barbearia Navalha de Ouro',
    slug: 'navalha-de-ouro',
    businessType: 'barbearia',
    // 'pro' não existe em PLAN_TIERS (lib/plans.ts): caía no tier free, com 1
    // profissional e nenhum recurso liberado, o oposto do que a demo quer.
    plan: 'profissional',
    // Conta de demonstração não deve expirar durante o uso.
    trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    phone: '11987654321',
    email: 'contato@navalhadeouro.com',
    document: '12.345.678/0001-90',
    address: 'Av. Paulista, 1000 · Bela Vista, São Paulo/SP',
    addressNumber: '1000',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    cep: '01310-100',
    themeColor: '#0F4C5C',
    bannerImageUrl: 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70',
    footerMessage: 'Tradição e estilo desde 2015 · Av. Paulista, 1000',
    welcomeMessage:
      'Bem-vindo à Navalha de Ouro! Agende seu horário em poucos cliques e venha renovar o visual.',
    autoConfirm: true,
    socials: { instagram: 'navalhadeouro', whatsapp: '11987654321' },
    paymentSettings: {
      cash: true,
      pix: true,
      debit: true,
      credit: { enabled: true, maxInstallments: 12, receiptMode: 'upfront' },
    },
    quiz: {
      teamSize: '2-5',
      monthlyClients: '151-500',
      mainGoal: 'organizar-agenda',
      heardFrom: 'indicacao',
    },
  })

  await insertAll(
    schema.workingHours,
    Object.entries(estHours).map(([dow, h]) => ({
      establishmentId: estId,
      dayOfWeek: Number(dow),
      opensAt: h.opensAt,
      closesAt: h.closesAt,
      isClosed: h.isClosed,
    })),
  )

  // O dono da conta também é um profissional (isOwner): aparece com a coroa, não
  // pode ser excluído e só tem jornada/status editáveis. Sem comissão/folha nem
  // agenda (o dono aqui administra). Inserido primeiro, como no cadastro real.
  await db.insert(schema.employees).values({
    establishmentId: estId,
    name: 'Lucas Oliveira',
    isOwner: true,
    workStart: '09:00',
    workEnd: '19:00',
    workDays: [1, 2, 3, 4, 5, 6],
  })

  await insertAll(
    schema.employees,
    empDefs.map((e) => ({
      id: empId[e.key],
      establishmentId: estId,
      name: e.name,
      email: e.email,
      phone: e.phone,
      birthDate: e.birthDate,
      gender: e.gender,
      workStart: e.workStart,
      workEnd: e.workEnd,
      lunchStart: e.lunchStart,
      lunchEnd: e.lunchEnd,
      workDays: e.workDays,
      commissionEnabled: true,
      commissionType: 'percent',
      salaryCents: e.salaryCents,
      paymentDays: [{ day: 5, amountCents: e.salaryCents }],
    })),
  )

  // Serviços (inclui o pacote/combo)
  await insertAll(schema.services, [
    ...svcDefs.map((s) => ({
      id: svcId[s.key],
      establishmentId: estId,
      name: s.name,
      durationMinutes: s.durationMinutes,
      priceCents: s.priceCents,
      active: s.active ?? true,
    })),
    {
      id: svcId['combo'],
      establishmentId: estId,
      name: svcByKey['combo'].name,
      durationMinutes: comboDur,
      priceCents: comboPrice,
      isPackage: true,
      packageServiceIds: comboKeys.map((k) => svcId[k]),
      packageDiscountType: 'percent',
      packageDiscountValue: comboDiscountPct,
    },
  ])

  // Comissões por serviço
  const commissionConfigRows: (typeof schema.employeeCommissions.$inferInsert)[] = []
  for (const e of empDefs) {
    for (const [k, v] of Object.entries(e.commissions)) {
      commissionConfigRows.push({ employeeId: empId[e.key], serviceId: svcId[k], value: v })
    }
  }
  await insertAll(schema.employeeCommissions, commissionConfigRows)

  await insertAll(
    schema.products,
    prodDefs.map((p) => ({
      id: prodId[p.key],
      establishmentId: estId,
      name: p.name,
      brand: p.brand,
      priceCents: p.priceCents,
      costCents: p.costCents,
      stockQuantity: stockLeft[p.key],
      sku: p.sku,
    })),
  )

  await insertAll(schema.clients, clients)

  // Cupons: manuais + campanha + os cunhados por resgate
  await insertAll(schema.coupons, [
    {
      id: couponVolta10Id,
      establishmentId: estId,
      name: 'Volte sempre (10%)',
      code: 'VOLTA10',
      source: 'manual',
      discountType: 'percent',
      discountValue: 10,
      appliesTo: 'total',
      usesPerClient: 3,
      active: true,
    },
    {
      id: couponBarba5Id,
      establishmentId: estId,
      name: 'R$ 5 na barba',
      code: 'BARBA5',
      source: 'manual',
      discountType: 'fixed',
      discountValue: 500,
      appliesTo: 'service',
      appliesToServiceIds: [svcId['barba'], svcId['cortebarba']],
      usesPerClient: 5,
      active: true,
    },
    {
      id: couponCampanhaId,
      establishmentId: estId,
      name: 'Primeira visita 20% OFF',
      code: null,
      source: 'campaign',
      discountType: 'percent',
      discountValue: 20,
      appliesTo: 'total',
      maxDiscountCents: 3000,
      validFrom: today.slice(0, 7) + '-01',
      firstVisitOnly: true,
      autoApply: true,
      active: true,
    },
    ...mintedCoupons,
  ])

  // Programas de fidelidade e pontos
  await db.insert(schema.loyaltyPrograms).values({
    establishmentId: estId,
    active: true,
    stampsRequired: LOYALTY_STAMPS_REQUIRED,
    minTicketCents: LOYALTY_MIN_TICKET,
    rewardType: 'free_service',
    rewardValue: 0,
    rewardServiceIds: LOYALTY_REWARD_SERVICE_IDS,
  })
  await db.insert(schema.pointsPrograms).values({
    establishmentId: estId,
    active: true,
    pointsPerService: POINTS_PER_SERVICE,
    pointsPerCurrencyUnit: POINTS_PER_CURRENCY,
  })
  await insertAll(schema.pointsRewards, [
    { id: pointsReward300Id, establishmentId: estId, name: 'R$ 8 de desconto', costPoints: 300, rewardType: 'fixed', rewardValue: 800, active: true },
    { id: pointsReward600Id, establishmentId: estId, name: 'R$ 15 de desconto', costPoints: 600, rewardType: 'fixed', rewardValue: 1500, active: true },
    { id: pointsReward1000Id, establishmentId: estId, name: 'Corte ou Barba grátis', costPoints: 1000, rewardType: 'free_service', rewardValue: 0, rewardServiceIds: [svcId['corte'], svcId['barba']], active: true },
  ])

  console.log('Gravando custos fixos e agenda…')
  await insertAll(schema.recurringExpenses, recurringExpenseRows)
  await insertAll(schema.timeBlocks, timeBlockRows)

  console.log(`Inserindo ${appointmentRows.length} agendamentos…`)
  await insertAll(schema.appointments, appointmentRows)

  console.log(`Inserindo ${transactionRows.length} lançamentos de caixa…`)
  await insertAll(schema.transactions, transactionRows)
  await insertAll(schema.commissionEntries, commissionRows)
  await insertAll(schema.couponRedemptions, couponRedemptionRows)

  // Fidelidade: resgates antes dos carimbos (FK), depois os carimbos
  await insertAll(schema.loyaltyRedemptions, loyaltyRedemptionRows)
  await insertAll(schema.loyaltyStamps, stampRows)
  await insertAll(schema.pointsEntries, pointsRows)

  await insertAll(schema.waitlistEntries, waitlistRows)

  console.log('')
  console.log('════════════════════════════════════════════════')
  console.log('  Seed concluído: Barbearia Navalha de Ouro')
  console.log('════════════════════════════════════════════════')
  console.log(`  Período: ${rangeStart} → ${rangeEnd} (hoje: ${today})`)
  console.log(`  Clientes:       ${clients.length}`)
  console.log(`  Profissionais:  ${empDefs.length}`)
  console.log(`  Agendamentos:   ${appointmentRows.length}`)
  console.log(`    · concluídos: ${countCompleted}`)
  console.log(`    · confirmados:${countConfirmed}`)
  console.log(`    · pendentes:  ${countPending}`)
  console.log(`    · cancelados: ${countCancelled}`)
  console.log(`  Lançamentos:    ${transactionRows.length}`)
  console.log(`  Comissões:      ${commissionRows.length}`)
  console.log(`  Carimbos:       ${stampRows.length}  |  Resgates fidelidade: ${loyaltyRedemptionRows.length}`)
  console.log(`  Pontos (linhas):${pointsRows.length}`)
  console.log('')
  console.log('  Login:  admin@barbearia.com')
  console.log('  Senha:  admin123')
  console.log('  Link público: http://localhost:5173/navalha-de-ouro')
  console.log('')
}

main()
  .catch((err) => {
    console.error('Falha no seed:', err)
    process.exitCode = 1
  })
  .finally(() => pool.end())
