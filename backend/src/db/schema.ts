import { relations } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const appointmentStatusEnum = pgEnum('appointment_status', [
  'confirmed',
  'cancelled',
  'completed',
  'pending',
])

export const createdViaEnum = pgEnum('created_via', ['panel', 'public'])

export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense'])

// Fila de espera: 'waiting' aguardando encaixe; 'scheduled' já virou agendamento.
export const waitlistStatusEnum = pgEnum('waitlist_status', ['waiting', 'scheduled'])

// Marketing/fidelidade: o cupom é o instrumento universal de desconto.
// 'manual' = código criado pelo dono; 'campaign' = desconto automático por
// condição (autoApply); 'loyalty'/'points' = cupom pessoal cunhado pelos
// programas de fidelidade/pontos.
export const couponSourceEnum = pgEnum('coupon_source', [
  'manual',
  'campaign',
  'loyalty',
  'points',
])
// 'free_service' = o serviço do atendimento sai de graça (desconto = preço do
// serviço, nunca dos produtos).
export const couponDiscountTypeEnum = pgEnum('coupon_discount_type', [
  'percent',
  'fixed',
  'free_service',
])
// Base do desconto: ticket inteiro (serviço + produtos) ou só a linha do serviço.
export const couponAppliesToEnum = pgEnum('coupon_applies_to', ['total', 'service'])

export const loyaltyRewardTypeEnum = pgEnum('loyalty_reward_type', [
  'free_service',
  'percent',
  'fixed',
])

export const pointsEntryTypeEnum = pgEnum('points_entry_type', ['earn', 'redeem'])

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'pending',
  'active',
  'past_due',
  'canceled',
])

export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'yearly'])

export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'confirmed',
  'received',
  'overdue',
  'refunded',
  'failed',
])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // Dados pessoais do contratante (dono da conta)
  phone: text('phone'),
  birthDate: date('birth_date', { mode: 'string' }),
  cpf: text('cpf'),
  // Redefinição de senha por código enviado no e-mail (hash bcrypt do código +
  // validade). Limpos após uso ou expiração. Ver modules/auth.
  passwordResetCodeHash: text('password_reset_code_hash'),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
  // Tentativas erradas do código atual: o código é queimado após o limite, para
  // travar força bruta do código de 6 dígitos independentemente do IP de origem.
  passwordResetAttempts: integer('password_reset_attempts').notNull().default(0),
  // Momento do aceite dos Termos de Uso + Política de Privacidade no cadastro.
  termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const establishments = pgTable('establishments', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  themeColor: text('theme_color').notNull().default('#0F4C5C'),
  // Personalização da página pública (plano pago). Imagens são URLs (sem upload).
  bannerImageUrl: text('banner_image_url'),
  footerMessage: text('footer_message'),
  welcomeMessage: text('welcome_message'),
  businessType: text('business_type').notNull().default('outro'),
  phone: text('phone'),
  email: text('email'),
  // CNPJ da empresa (armazenado formatado como digitado)
  document: text('document'),
  // Endereço estruturado (logradouro + número + bairro + cidade + UF).
  // Preenchido pelo CEP via ViaCEP.
  address: text('address'),
  addressNumber: text('address_number'),
  neighborhood: text('neighborhood'),
  city: text('city'),
  state: text('state'),
  cep: text('cep'),
  socials: jsonb('socials').$type<{
    instagram?: string
    whatsapp?: string
  }>(),
  // Agendamentos do link público: true = confirmados na hora; false = ficam
  // pendentes até o estabelecimento aceitar.
  autoConfirm: boolean('auto_confirm').notNull().default(true),
  // Formas de pagamento aceitas no fechamento do serviço. Para crédito,
  // guarda apenas o máximo de parcelas (sem distinguir bandeira do cartão).
  paymentSettings: jsonb('payment_settings')
    .$type<{
      cash: boolean
      pix: boolean
      debit: boolean
      // receiptMode: 'upfront' recebe o total na hora; 'monthly' recebe o crédito
      // parcelado mês a mês (parcelas viram receitas futuras). Ausente = 'upfront'.
      credit: { enabled: boolean; maxInstallments: number; receiptMode?: 'upfront' | 'monthly' }
    }>()
    .notNull()
    .default({
      cash: true,
      pix: true,
      debit: true,
      credit: { enabled: true, maxInstallments: 12, receiptMode: 'upfront' },
    }),
  quiz: jsonb('quiz').$type<Record<string, string>>(),
  plan: text('plan').notNull().default('free'),
  // Fim do teste grátis (sem cartão) concedido no cadastro. Null = conta legada
  // (anterior ao trial): tratada como 'free' gravável. Enquanto now < trialEndsAt
  // o acesso efetivo é o plano de teste; depois, sem assinatura paga, a conta
  // fica somente-leitura (ver lib/plan.ts#getAccessState).
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// dayOfWeek: 0 = domingo ... 6 = sábado
export const workingHours = pgTable(
  'working_hours',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    opensAt: text('opens_at').notNull().default('09:00'),
    closesAt: text('closes_at').notNull().default('19:00'),
    isClosed: boolean('is_closed').notNull().default(false),
  },
  (t) => [uniqueIndex('working_hours_establishment_day_idx').on(t.establishmentId, t.dayOfWeek)],
)

export const services = pgTable('services', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  durationMinutes: integer('duration_minutes').notNull(),
  priceCents: integer('price_cents').notNull(),
  active: boolean('active').notNull().default(true),
  // Pacote: agrupa vários serviços com um desconto. Quando isPackage = true,
  // durationMinutes e priceCents são calculados (soma dos itens menos desconto);
  // packageDiscountType é 'percent' (0–100) ou 'fixed' (centavos de desconto).
  isPackage: boolean('is_package').notNull().default(false),
  packageServiceIds: jsonb('package_service_ids').$type<string[]>(),
  packageDiscountType: text('package_discount_type'),
  packageDiscountValue: integer('package_discount_value'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  photoUrl: text('photo_url'),
  email: text('email'),
  phone: text('phone'),
  birthDate: date('birth_date', { mode: 'string' }),
  gender: text('gender'),
  // Jornada do profissional: horário de entrada/saída, almoço e dias que
  // trabalha (0=domingo … 6=sábado). Usados no cálculo de disponibilidade.
  workStart: text('work_start').notNull().default('09:00'),
  workEnd: text('work_end').notNull().default('18:00'),
  lunchStart: text('lunch_start'),
  lunchEnd: text('lunch_end'),
  workDays: jsonb('work_days').$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6]),
  active: boolean('active').notNull().default(true),
  // Comissão do profissional: se habilitada, o tipo ('percent' | 'fixed') define
  // como interpretar os valores por serviço em employee_commissions.
  commissionEnabled: boolean('commission_enabled').notNull().default(false),
  commissionType: text('commission_type').notNull().default('percent'),
  // Folha de pagamento — usada na previsão de custos fixos e na futura folha
  // salarial. Valores em centavos; bônus é uma lista de itens nomeados.
  salaryCents: integer('salary_cents'),
  bonuses: jsonb('bonuses')
    .$type<{ label: string; amountCents: number }[]>()
    .notNull()
    .default([]),
  vrCents: integer('vr_cents'),
  vtCents: integer('vt_cents'),
  vaCents: integer('va_cents'),
  // 1 ou 2 dias de pagamento no mês; cada um com o valor pago naquele dia
  // (ex.: bônus no dia 20 e salário no dia 5). Vazio = não entra na folha.
  paymentDays: jsonb('payment_days')
    .$type<{ day: number; amountCents: number }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Comissão de um profissional por serviço. value: se commissionType do
// profissional é 'percent', é a porcentagem inteira (0–100); se 'fixed', é o
// valor em centavos.
export const employeeCommissions = pgTable(
  'employee_commissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    value: integer('value').notNull().default(0),
  },
  (t) => [
    uniqueIndex('employee_commissions_employee_service_idx').on(t.employeeId, t.serviceId),
  ],
)

// Produtos vendidos no balcão (estoque). priceCents = preço de venda.
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceCents: integer('price_cents').notNull(),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  active: boolean('active').notNull().default(true),
  // Campos opcionais do produto
  brand: text('brand'),
  supplier: text('supplier'),
  description: text('description'),
  sku: text('sku'),
  barcode: text('barcode'),
  costCents: integer('cost_cents'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Bloqueios de agenda: feriados, folgas ou intervalos indisponíveis.
// startTime/endTime nulos = dia inteiro bloqueado.
export const timeBlocks = pgTable(
  'time_blocks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: text('start_time'),
    endTime: text('end_time'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('time_blocks_establishment_date_idx').on(t.establishmentId, t.date)],
)

// phone: somente dígitos (ex: 11987654321)
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    birthDate: date('birth_date', { mode: 'string' }),
    gender: text('gender'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('clients_establishment_phone_idx').on(t.establishmentId, t.phone)],
)

// date: 'YYYY-MM-DD' | startTime/endTime: 'HH:mm' (hora local do estabelecimento)
export const appointments = pgTable(
  'appointments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'restrict' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'restrict' }),
    date: date('date', { mode: 'string' }).notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    status: appointmentStatusEnum('status').notNull().default('confirmed'),
    createdVia: createdViaEnum('created_via').notNull().default('panel'),
    notes: text('notes'),
    // Fechamento do serviço: desconto aplicado e formas de pagamento usadas.
    discountCents: integer('discount_cents').notNull().default(0),
    payments: jsonb('payments').$type<
      {
        method: 'cash' | 'pix' | 'debit' | 'credit'
        installments: number | null
        amountCents: number
      }[]
    >(),
    // Produtos vendidos junto no fechamento (snapshot de nome/preço na venda)
    saleProducts: jsonb('sale_products').$type<
      { productId: string; name: string; quantity: number; unitPriceCents: number }[]
    >(),
    // Serviços extras realizados junto no fechamento, além do serviço principal
    // do agendamento (snapshot de nome/preço na venda)
    saleServices: jsonb('sale_services').$type<
      { serviceId: string; name: string; quantity: number; unitPriceCents: number }[]
    >(),
    // Efeito líquido deste fechamento no saldo devedor do cliente (com sinal):
    // > 0 = cliente passou a dever mais; < 0 = quitou parte da dívida anterior.
    // O saldo devedor do cliente é a soma de debt_cents dos seus atendimentos.
    debtCents: integer('debt_cents').notNull().default(0),
    // Gorjeta recebida no fechamento (valor pago acima do total devido).
    tipCents: integer('tip_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('appointments_establishment_date_idx').on(t.establishmentId, t.date)],
)

// Fila de espera (dia cheio): o dono enfileira o cliente e, ao abrir vaga,
// "encaixa" (promove) a entrada em um agendamento. Só no painel.
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // cascade (não restrict): apagar um serviço não deve travar por causa de
    // uma linha transitória na fila.
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    // Profissional preferido (opcional); null = qualquer um.
    preferredEmployeeId: uuid('preferred_employee_id').references(() => employees.id, {
      onDelete: 'set null',
    }),
    // Dia desejado ('YYYY-MM-DD'); default hoje no service.
    targetDate: date('target_date', { mode: 'string' }).notNull(),
    note: text('note'),
    status: waitlistStatusEnum('status').notNull().default('waiting'),
    // Preenchido ao promover para agendamento.
    scheduledAppointmentId: uuid('scheduled_appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('waitlist_entries_establishment_status_date_idx').on(
      t.establishmentId,
      t.status,
      t.targetDate,
    ),
  ],
)

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'set null',
    }),
    // Preenchido quando a saída é a "baixa" de um custo fixo recorrente do mês.
    // set null: apagar o custo fixo mantém o lançamento histórico no caixa.
    recurringExpenseId: uuid('recurring_expense_id').references(() => recurringExpenses.id, {
      onDelete: 'set null',
    }),
    // Preenchido quando a saída é o pagamento (folha) de um profissional no mês.
    employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
    // Dia de pagamento configurado que originou esta baixa de folha (1–31).
    // Identifica a parcela mesmo quando o vencimento "encurta" para o mesmo dia
    // do mês (ex.: dias 30 e 31 em fevereiro caem ambos no último dia).
    payrollDay: integer('payroll_day'),
    // Crédito parcelado recebido mês a mês: cada parcela é uma receita futura
    // datada no seu mês. installmentTotal não-nulo marca a linha como parcela;
    // number é 1..total. Nulos em lançamentos normais.
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    type: transactionTypeEnum('type').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('transactions_establishment_date_idx').on(t.establishmentId, t.date),
    index('transactions_recurring_expense_idx').on(t.recurringExpenseId),
    index('transactions_employee_idx').on(t.employeeId),
  ],
)

// Custos fixos recorrentes (aluguel, energia, salários...). Servem para prever
// as saídas do mês e gerar o lançamento no caixa quando "baixados" (uma
// transação com recurring_expense_id apontando para a linha aqui).
export const recurringExpenses = pgTable(
  'recurring_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    // Dia do vencimento (1–31). Em meses mais curtos é ajustado ao último dia.
    dayOfMonth: integer('day_of_month').notNull().default(1),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('recurring_expenses_establishment_idx').on(t.establishmentId)],
)

// Comissão apurada de um agendamento concluído. Guarda um snapshot da regra
// aplicada (tipo + valor) e do valor calculado, para preservar o histórico
// mesmo que a configuração do profissional mude depois. Uma linha por
// agendamento; ao reabrir/cancelar o atendimento, a linha é removida.
export const commissionEntries = pgTable(
  'commission_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => services.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    // Base de cálculo: preço do serviço no fechamento (centavos)
    baseCents: integer('base_cents').notNull(),
    // Snapshot da regra: 'percent' | 'fixed' e o valor (0–100 ou centavos)
    commissionType: text('commission_type').notNull(),
    commissionValue: integer('commission_value').notNull(),
    // Valor apurado da comissão (centavos)
    commissionCents: integer('commission_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('commission_entries_appointment_idx').on(t.appointmentId),
    index('commission_entries_establishment_date_idx').on(t.establishmentId, t.date),
    index('commission_entries_employee_idx').on(t.employeeId),
  ],
)

// Cupom de desconto (definição/regra) — serve o cupom manual, a campanha
// automática (autoApply, code null) e o cupom pessoal cunhado por
// fidelidade/pontos (clientId preenchido, maxUses 1). discountValue: 0–100
// quando 'percent', centavos quando 'fixed', ignorado em 'free_service'.
export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    // Rótulo exibido na lista (obrigatório na prática para campanhas, que não
    // têm código); opcional como descrição de cupons manuais.
    name: text('name'),
    code: text('code'),
    source: couponSourceEnum('source').notNull().default('manual'),
    discountType: couponDiscountTypeEnum('discount_type').notNull(),
    discountValue: integer('discount_value').notNull().default(0),
    appliesTo: couponAppliesToEnum('applies_to').notNull().default('total'),
    // null/vazio = qualquer serviço
    appliesToServiceIds: jsonb('applies_to_service_ids').$type<string[]>(),
    minSpendCents: integer('min_spend_cents').notNull().default(0),
    // Teto opcional do desconto (protege percent/free_service em tickets altos)
    maxDiscountCents: integer('max_discount_cents'),
    validFrom: date('valid_from', { mode: 'string' }),
    validUntil: date('valid_until', { mode: 'string' }),
    // null = ilimitado
    maxUses: integer('max_uses'),
    usesPerClient: integer('uses_per_client').notNull().default(1),
    firstVisitOnly: boolean('first_visit_only').notNull().default(false),
    autoApply: boolean('auto_apply').notNull().default(false),
    // Preenchido = cupom pessoal (só vale para este cliente)
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Postgres mantém múltiplos NULL distintos: campanhas (code null) não colidem
    uniqueIndex('coupons_establishment_code_idx').on(t.establishmentId, t.code),
    index('coupons_establishment_client_idx').on(t.establishmentId, t.clientId),
    index('coupons_establishment_active_auto_idx').on(t.establishmentId, t.active, t.autoApply),
  ],
)

// Ledger de uso de cupom: 1 linha por atendimento (estorno ao reabrir =
// delete por appointmentId, igual a commission_entries).
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id, { onDelete: 'restrict' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    // Snapshot do desconto aplicado (centavos)
    discountCents: integer('discount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_redemptions_appointment_idx').on(t.appointmentId),
    index('coupon_redemptions_coupon_idx').on(t.couponId),
    index('coupon_redemptions_coupon_client_idx').on(t.couponId, t.clientId),
  ],
)

// Cartão de fidelidade: configuração (1 por estabelecimento). Cada atendimento
// concluído com finalCents >= minTicketCents vale 1 carimbo; ao juntar
// stampsRequired o cliente resgata a recompensa (vira cupom pessoal).
export const loyaltyPrograms = pgTable(
  'loyalty_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(false),
    stampsRequired: integer('stamps_required').notNull().default(10),
    minTicketCents: integer('min_ticket_cents').notNull().default(0),
    rewardType: loyaltyRewardTypeEnum('reward_type').notNull().default('free_service'),
    rewardValue: integer('reward_value').notNull().default(0),
    // Serviços elegíveis do 'free_service' (um ou mais). null/vazio = qualquer
    // serviço. Sem FK (igual a coupons.appliesToServiceIds): ids órfãos de um
    // serviço removido simplesmente deixam de casar.
    rewardServiceIds: jsonb('reward_service_ids').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('loyalty_programs_establishment_idx').on(t.establishmentId)],
)

// Concessão da recompensa do cartão: snapshot da regra no momento do resgate
// e o cupom pessoal cunhado.
export const loyaltyRedemptions = pgTable('loyalty_redemptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  establishmentId: uuid('establishment_id')
    .notNull()
    .references(() => establishments.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id')
    .notNull()
    .references(() => clients.id, { onDelete: 'cascade' }),
  stampsSpent: integer('stamps_spent').notNull(),
  couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
  rewardType: loyaltyRewardTypeEnum('reward_type').notNull(),
  rewardValue: integer('reward_value').notNull(),
  // Snapshot dos serviços elegíveis no momento do resgate (free_service)
  rewardServiceIds: jsonb('reward_service_ids').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// Ledger de carimbos: 1 linha por carimbo, chaveada pelo atendimento que o
// gerou (estorno ao reabrir = delete por appointmentId). redemptionId null =
// disponível; preenchido = consumido por um resgate.
export const loyaltyStamps = pgTable(
  'loyalty_stamps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    appointmentId: uuid('appointment_id')
      .notNull()
      .references(() => appointments.id, { onDelete: 'cascade' }),
    redemptionId: uuid('redemption_id').references(() => loyaltyRedemptions.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('loyalty_stamps_appointment_idx').on(t.appointmentId),
    index('loyalty_stamps_establishment_client_idx').on(t.establishmentId, t.clientId),
  ],
)

// Programa de pontos: configuração (1 por estabelecimento). Pontos ganhos por
// atendimento concluído = pointsPerService + floor(finalCents/100) * pointsPerCurrencyUnit.
export const pointsPrograms = pgTable(
  'points_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(false),
    pointsPerService: integer('points_per_service').notNull().default(0),
    pointsPerCurrencyUnit: integer('points_per_currency_unit').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('points_programs_establishment_idx').on(t.establishmentId)],
)

// Catálogo de níveis de resgate: X pontos = recompensa (vira cupom pessoal).
export const pointsRewards = pgTable(
  'points_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    costPoints: integer('cost_points').notNull(),
    rewardType: couponDiscountTypeEnum('reward_type').notNull(),
    rewardValue: integer('reward_value').notNull().default(0),
    // Serviços elegíveis do 'free_service' (um ou mais). null/vazio = qualquer
    // serviço. Sem FK (igual a coupons.appliesToServiceIds).
    rewardServiceIds: jsonb('reward_service_ids').$type<string[]>(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('points_rewards_establishment_active_idx').on(t.establishmentId, t.active)],
)

// Ledger de pontos: 'earn' (positivo, 1 por atendimento concluído) e 'redeem'
// (negativo, appointmentId null). Saldo = sum(points) por cliente.
export const pointsEntries = pgTable(
  'points_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    // Preenchido para 'earn'; null para 'redeem'
    appointmentId: uuid('appointment_id').references(() => appointments.id, {
      onDelete: 'cascade',
    }),
    rewardId: uuid('reward_id').references(() => pointsRewards.id, { onDelete: 'set null' }),
    type: pointsEntryTypeEnum('type').notNull(),
    // Positivo em 'earn', negativo em 'redeem'
    points: integer('points').notNull(),
    couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 1 'earn' por atendimento; 'redeem' tem appointmentId null (múltiplos ok)
    uniqueIndex('points_entries_appointment_idx').on(t.appointmentId),
    index('points_entries_establishment_client_idx').on(t.establishmentId, t.clientId),
  ],
)

// Assinatura paga do estabelecimento (cobrança recorrente via Asaas). 1 por
// estabelecimento — cancelar não apaga a linha, só marca status/canceledAt
// (mantém acesso até currentPeriodEnd, ver lib/plan.ts#getEffectivePlan).
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    establishmentId: uuid('establishment_id')
      .notNull()
      .references(() => establishments.id, { onDelete: 'cascade' }),
    planSlug: text('plan_slug').notNull(),
    billingCycle: billingCycleEnum('billing_cycle').notNull(),
    status: subscriptionStatusEnum('status').notNull().default('pending'),
    asaasCustomerId: text('asaas_customer_id').notNull(),
    // Assinatura recorrente do Asaas (mensal ou anual à vista). Null quando o
    // registro é um parcelamento (cobrança avulsa parcelada no cartão).
    asaasSubscriptionId: text('asaas_subscription_id'),
    // Parcelamento anual (POST /payments installmentCount): id do grupo de
    // parcelas no Asaas. Null quando o registro é uma assinatura recorrente.
    asaasInstallmentId: text('asaas_installment_id'),
    // Nº de parcelas do anual parcelado (2–12). Null = assinatura recorrente
    // (mensal ou anual à vista, que não é parcelamento).
    installments: integer('installments'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    // Prazo de tolerância após um PAYMENT_OVERDUE; expirado = rebaixa pro free
    // (ver getEffectivePlan). Null = sem atraso em aberto.
    graceUntil: timestamp('grace_until', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('subscriptions_establishment_idx').on(t.establishmentId),
    uniqueIndex('subscriptions_asaas_subscription_idx').on(t.asaasSubscriptionId),
    uniqueIndex('subscriptions_asaas_installment_idx').on(t.asaasInstallmentId),
  ],
)

// Log de cobranças recebidas via webhook do Asaas — existe principalmente
// para idempotência (asaasPaymentId único: o Asaas reenvia webhook em não-2xx).
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    asaasPaymentId: text('asaas_payment_id').notNull(),
    status: paymentStatusEnum('status').notNull(),
    amountCents: integer('amount_cents').notNull(),
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    invoiceUrl: text('invoice_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payments_asaas_payment_idx').on(t.asaasPaymentId),
    index('payments_subscription_idx').on(t.subscriptionId),
  ],
)

export const usersRelations = relations(users, ({ many }) => ({
  establishments: many(establishments),
}))

export const establishmentsRelations = relations(establishments, ({ one, many }) => ({
  owner: one(users, { fields: [establishments.ownerId], references: [users.id] }),
  workingHours: many(workingHours),
  services: many(services),
  employees: many(employees),
  clients: many(clients),
  appointments: many(appointments),
  transactions: many(transactions),
  timeBlocks: many(timeBlocks),
  products: many(products),
  recurringExpenses: many(recurringExpenses),
  coupons: many(coupons),
  couponRedemptions: many(couponRedemptions),
  loyaltyPrograms: many(loyaltyPrograms),
  loyaltyStamps: many(loyaltyStamps),
  loyaltyRedemptions: many(loyaltyRedemptions),
  pointsPrograms: many(pointsPrograms),
  pointsRewards: many(pointsRewards),
  pointsEntries: many(pointsEntries),
  subscriptions: many(subscriptions),
}))

export const productsRelations = relations(products, ({ one }) => ({
  establishment: one(establishments, {
    fields: [products.establishmentId],
    references: [establishments.id],
  }),
}))

export const timeBlocksRelations = relations(timeBlocks, ({ one }) => ({
  establishment: one(establishments, {
    fields: [timeBlocks.establishmentId],
    references: [establishments.id],
  }),
}))

export const workingHoursRelations = relations(workingHours, ({ one }) => ({
  establishment: one(establishments, {
    fields: [workingHours.establishmentId],
    references: [establishments.id],
  }),
}))

export const servicesRelations = relations(services, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [services.establishmentId],
    references: [establishments.id],
  }),
  appointments: many(appointments),
  commissions: many(employeeCommissions),
}))

export const employeesRelations = relations(employees, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [employees.establishmentId],
    references: [establishments.id],
  }),
  appointments: many(appointments),
  commissions: many(employeeCommissions),
}))

export const employeeCommissionsRelations = relations(employeeCommissions, ({ one }) => ({
  employee: one(employees, {
    fields: [employeeCommissions.employeeId],
    references: [employees.id],
  }),
  service: one(services, {
    fields: [employeeCommissions.serviceId],
    references: [services.id],
  }),
}))

export const clientsRelations = relations(clients, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [clients.establishmentId],
    references: [establishments.id],
  }),
  appointments: many(appointments),
}))

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  establishment: one(establishments, {
    fields: [appointments.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [appointments.clientId], references: [clients.id] }),
  service: one(services, { fields: [appointments.serviceId], references: [services.id] }),
  employee: one(employees, { fields: [appointments.employeeId], references: [employees.id] }),
}))

export const transactionsRelations = relations(transactions, ({ one }) => ({
  establishment: one(establishments, {
    fields: [transactions.establishmentId],
    references: [establishments.id],
  }),
  appointment: one(appointments, {
    fields: [transactions.appointmentId],
    references: [appointments.id],
  }),
  recurringExpense: one(recurringExpenses, {
    fields: [transactions.recurringExpenseId],
    references: [recurringExpenses.id],
  }),
}))

export const recurringExpensesRelations = relations(recurringExpenses, ({ one }) => ({
  establishment: one(establishments, {
    fields: [recurringExpenses.establishmentId],
    references: [establishments.id],
  }),
}))

export const commissionEntriesRelations = relations(commissionEntries, ({ one }) => ({
  establishment: one(establishments, {
    fields: [commissionEntries.establishmentId],
    references: [establishments.id],
  }),
  appointment: one(appointments, {
    fields: [commissionEntries.appointmentId],
    references: [appointments.id],
  }),
  employee: one(employees, {
    fields: [commissionEntries.employeeId],
    references: [employees.id],
  }),
  service: one(services, {
    fields: [commissionEntries.serviceId],
    references: [services.id],
  }),
}))

export const couponsRelations = relations(coupons, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [coupons.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [coupons.clientId], references: [clients.id] }),
  redemptions: many(couponRedemptions),
}))

export const couponRedemptionsRelations = relations(couponRedemptions, ({ one }) => ({
  establishment: one(establishments, {
    fields: [couponRedemptions.establishmentId],
    references: [establishments.id],
  }),
  coupon: one(coupons, { fields: [couponRedemptions.couponId], references: [coupons.id] }),
  client: one(clients, { fields: [couponRedemptions.clientId], references: [clients.id] }),
  appointment: one(appointments, {
    fields: [couponRedemptions.appointmentId],
    references: [appointments.id],
  }),
}))

export const loyaltyProgramsRelations = relations(loyaltyPrograms, ({ one }) => ({
  establishment: one(establishments, {
    fields: [loyaltyPrograms.establishmentId],
    references: [establishments.id],
  }),
}))

export const loyaltyStampsRelations = relations(loyaltyStamps, ({ one }) => ({
  establishment: one(establishments, {
    fields: [loyaltyStamps.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [loyaltyStamps.clientId], references: [clients.id] }),
  appointment: one(appointments, {
    fields: [loyaltyStamps.appointmentId],
    references: [appointments.id],
  }),
  redemption: one(loyaltyRedemptions, {
    fields: [loyaltyStamps.redemptionId],
    references: [loyaltyRedemptions.id],
  }),
}))

export const loyaltyRedemptionsRelations = relations(loyaltyRedemptions, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [loyaltyRedemptions.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [loyaltyRedemptions.clientId], references: [clients.id] }),
  coupon: one(coupons, { fields: [loyaltyRedemptions.couponId], references: [coupons.id] }),
  stamps: many(loyaltyStamps),
}))

export const pointsProgramsRelations = relations(pointsPrograms, ({ one }) => ({
  establishment: one(establishments, {
    fields: [pointsPrograms.establishmentId],
    references: [establishments.id],
  }),
}))

export const pointsRewardsRelations = relations(pointsRewards, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [pointsRewards.establishmentId],
    references: [establishments.id],
  }),
  entries: many(pointsEntries),
}))

export const pointsEntriesRelations = relations(pointsEntries, ({ one }) => ({
  establishment: one(establishments, {
    fields: [pointsEntries.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [pointsEntries.clientId], references: [clients.id] }),
  appointment: one(appointments, {
    fields: [pointsEntries.appointmentId],
    references: [appointments.id],
  }),
  reward: one(pointsRewards, {
    fields: [pointsEntries.rewardId],
    references: [pointsRewards.id],
  }),
  coupon: one(coupons, { fields: [pointsEntries.couponId], references: [coupons.id] }),
}))

export const waitlistEntriesRelations = relations(waitlistEntries, ({ one }) => ({
  establishment: one(establishments, {
    fields: [waitlistEntries.establishmentId],
    references: [establishments.id],
  }),
  client: one(clients, { fields: [waitlistEntries.clientId], references: [clients.id] }),
  service: one(services, { fields: [waitlistEntries.serviceId], references: [services.id] }),
  preferredEmployee: one(employees, {
    fields: [waitlistEntries.preferredEmployeeId],
    references: [employees.id],
  }),
  scheduledAppointment: one(appointments, {
    fields: [waitlistEntries.scheduledAppointmentId],
    references: [appointments.id],
  }),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  establishment: one(establishments, {
    fields: [subscriptions.establishmentId],
    references: [establishments.id],
  }),
  payments: many(payments),
}))

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}))
