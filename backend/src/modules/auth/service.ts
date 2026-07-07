import bcrypt from 'bcryptjs'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../../db'
import { employees, establishments, users, workingHours } from '../../db/schema'
import { AppError } from '../../lib/errors'
import type { LoginInput, RegisterInput, UpdateProfileInput } from './schemas'

const DEFAULT_WORKING_HOURS = [
  { dayOfWeek: 0, opensAt: '09:00', closesAt: '18:00', isClosed: true },
  { dayOfWeek: 1, opensAt: '09:00', closesAt: '19:00', isClosed: false },
  { dayOfWeek: 2, opensAt: '09:00', closesAt: '19:00', isClosed: false },
  { dayOfWeek: 3, opensAt: '09:00', closesAt: '19:00', isClosed: false },
  { dayOfWeek: 4, opensAt: '09:00', closesAt: '19:00', isClosed: false },
  { dayOfWeek: 5, opensAt: '09:00', closesAt: '19:00', isClosed: false },
  { dayOfWeek: 6, opensAt: '09:00', closesAt: '18:00', isClosed: false },
]

function sanitizeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    birthDate: user.birthDate,
    cpf: user.cpf,
  }
}

export async function isSlugAvailable(slug: string) {
  const existing = await db.query.establishments.findFirst({
    columns: { id: true },
    where: eq(establishments.slug, slug),
  })
  return { available: !existing }
}

export async function registerOwner(input: RegisterInput) {
  const email = input.email.toLowerCase().trim()

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existingUser) throw new AppError('Já existe uma conta com este e-mail', 409)

  const existingSlug = await db.query.establishments.findFirst({
    where: eq(establishments.slug, input.establishment.slug),
  })
  if (existingSlug) throw new AppError('Este link já está em uso, escolha outro', 409)

  const passwordHash = await bcrypt.hash(input.password, 10)

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ name: input.name.trim(), email, passwordHash, cpf: input.cpf, phone: input.phone })
      .returning()

    const [establishment] = await tx
      .insert(establishments)
      .values({
        ownerId: user.id,
        name: input.establishment.name.trim(),
        slug: input.establishment.slug,
        businessType: input.establishment.businessType,
        phone: input.establishment.phone,
        email: input.establishment.email,
        socials: input.establishment.socials,
        document: input.establishment.document,
        address: input.establishment.address,
        addressNumber: input.establishment.addressNumber,
        neighborhood: input.establishment.neighborhood,
        city: input.establishment.city,
        state: input.establishment.state,
        cep: input.establishment.cep,
        quiz: input.quiz,
        welcomeMessage: `Bem-vindo(a)! Agende seu horário na ${input.establishment.name.trim()} em poucos cliques.`,
      })
      .returning()

    await tx.insert(workingHours).values(
      DEFAULT_WORKING_HOURS.map((wh) => ({ ...wh, establishmentId: establishment.id })),
    )

    // Freemium: o primeiro (e único) profissional é o próprio dono
    await tx.insert(employees).values({ establishmentId: establishment.id, name: input.name.trim() })

    return { user: sanitizeUser(user), establishment }
  })
}

export async function authenticateOwner(input: LoginInput) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, input.email.toLowerCase().trim()),
  })
  if (!user) throw new AppError('E-mail ou senha incorretos', 401)

  const passwordMatches = await bcrypt.compare(input.password, user.passwordHash)
  if (!passwordMatches) throw new AppError('E-mail ou senha incorretos', 401)

  const establishment = await db.query.establishments.findFirst({
    where: eq(establishments.ownerId, user.id),
  })
  if (!establishment) throw new AppError('Nenhum estabelecimento vinculado a esta conta', 404)

  return { user: sanitizeUser(user), establishment }
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const data: Partial<typeof users.$inferInsert> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.phone !== undefined) data.phone = input.phone
  if (input.birthDate !== undefined) data.birthDate = input.birthDate
  if (input.cpf !== undefined) data.cpf = input.cpf
  if (input.email !== undefined) {
    const email = input.email.toLowerCase().trim()
    const existing = await db.query.users.findFirst({
      columns: { id: true },
      where: and(eq(users.email, email), ne(users.id, userId)),
    })
    if (existing) throw new AppError('Já existe uma conta com este e-mail', 409)
    data.email = email
  }

  if (Object.keys(data).length === 0) throw new AppError('Nenhum dado para atualizar', 400)

  const [updated] = await db.update(users).set(data).where(eq(users.id, userId)).returning()
  if (!updated) throw new AppError('Usuário não encontrado', 404)
  return sanitizeUser(updated)
}

export async function getProfile(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) throw new AppError('Usuário não encontrado', 404)

  const establishment = await db.query.establishments.findFirst({
    where: eq(establishments.ownerId, userId),
  })
  if (!establishment) throw new AppError('Nenhum estabelecimento vinculado a esta conta', 404)

  return { user: sanitizeUser(user), establishment }
}
