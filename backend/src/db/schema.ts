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
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    type: transactionTypeEnum('type').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('transactions_establishment_date_idx').on(t.establishmentId, t.date)],
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
}))
