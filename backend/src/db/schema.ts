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

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  // Dados pessoais do contratante (dono da conta)
  phone: text('phone'),
  birthDate: date('birth_date', { mode: 'string' }),
  cpf: text('cpf'),
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
  // CNPJ da empresa (armazenado formatado como digitado)
  document: text('document'),
  address: text('address'),
  cep: text('cep'),
  socials: jsonb('socials').$type<{
    instagram?: string
    whatsapp?: string
  }>(),
  // Agendamentos do link público: true = confirmados na hora; false = ficam
  // pendentes até o estabelecimento aceitar.
  autoConfirm: boolean('auto_confirm').notNull().default(true),
  // Formas de pagamento aceitas no fechamento do serviço. Para crédito,
  // guarda as bandeiras aceitas e o máximo de parcelas de cada uma.
  paymentSettings: jsonb('payment_settings')
    .$type<{
      cash: boolean
      pix: boolean
      debit: boolean
      credit: { enabled: boolean; brands: { name: string; maxInstallments: number }[] }
    }>()
    .notNull()
    .default({
      cash: true,
      pix: true,
      debit: true,
      credit: {
        enabled: true,
        brands: [
          { name: 'Visa', maxInstallments: 12 },
          { name: 'Mastercard', maxInstallments: 12 },
        ],
      },
    }),
  quiz: jsonb('quiz').$type<Record<string, string>>(),
  plan: text('plan').notNull().default('free'),
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
        brand: string | null
        installments: number | null
        amountCents: number
      }[]
    >(),
    // Produtos vendidos junto no fechamento (snapshot de nome/preço na venda)
    saleProducts: jsonb('sale_products').$type<
      { productId: string; name: string; quantity: number; unitPriceCents: number }[]
    >(),
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
