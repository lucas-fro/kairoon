import { randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, ne } from 'drizzle-orm'
import { db } from '../../db'
import { employees, establishments, users, workingHours } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { sendPasswordResetEmail, sendWelcomeEmail } from '../../lib/mailer'
import type { LoginInput, RegisterInput, UpdateProfileInput } from './schemas'

/** Código de redefinição de senha válido por 5 minutos. */
const RESET_CODE_TTL_MS = 5 * 60 * 1000

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

  const result = await db.transaction(async (tx) => {
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

  // E-mail de boas-vindas: fire-and-forget — nunca deve travar o cadastro nem
  // falhar por causa do envio (ex.: e-mail indisponível).
  void sendWelcomeEmail(result.user.email, result.user.name, result.establishment.name).catch(
    (err) => console.error('[auth] falha ao enviar e-mail de boas-vindas:', err),
  )

  return result
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

/**
 * Passo 1 (público): gera um código de 6 dígitos para o e-mail informado, guarda
 * o hash + validade (5 min) e envia por e-mail. A resposta é sempre genérica
 * (ok) — não revela se o e-mail existe (evita enumeração de contas). O envio é
 * fire-and-forget para não vazar existência por erro/tempo de resposta.
 */
export async function requestPasswordResetByEmail(email: string) {
  const normalized = email.toLowerCase().trim()
  const user = await db.query.users.findFirst({ where: eq(users.email, normalized) })

  if (user) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const passwordResetCodeHash = await bcrypt.hash(code, 10)
    const passwordResetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS)

    await db
      .update(users)
      .set({ passwordResetCodeHash, passwordResetExpiresAt })
      .where(eq(users.id, user.id))

    void sendPasswordResetEmail(user.email, user.name, code).catch((err) =>
      console.error('[auth] falha ao enviar código de redefinição:', err),
    )
  } else {
    // Roda um bcrypt "à toa" quando a conta não existe, para o tempo de resposta
    // não denunciar a existência do e-mail (a diferença dominante é o hash).
    await bcrypt.hash('uniform-timing-placeholder', 10)
  }

  return { ok: true as const }
}

/**
 * Localiza o usuário pelo e-mail e confere o código (válido e não expirado) sem
 * consumi-lo. Retorna null em qualquer falha — o chamador devolve sempre a mesma
 * mensagem, sem distinguir e-mail inexistente de código errado.
 */
async function findUserForResetCode(email: string, code: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  })
  if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) return null
  if (user.passwordResetExpiresAt.getTime() < Date.now()) return null
  const matches = await bcrypt.compare(code, user.passwordResetCodeHash)
  return matches ? user : null
}

/** Passo 2 (público): valida o código sem consumi-lo, antes de pedir a nova senha. */
export async function verifyPasswordResetCode(email: string, code: string) {
  const user = await findUserForResetCode(email, code)
  if (!user) throw new AppError('Código inválido ou expirado', 400)
  return { valid: true as const }
}

/** Passo 3 (público): revalida o código e troca a senha, consumindo o código. */
export async function resetPasswordByEmail(email: string, code: string, newPassword: string) {
  const user = await findUserForResetCode(email, code)
  if (!user) throw new AppError('Código inválido ou expirado', 400)

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await db
    .update(users)
    .set({ passwordHash, passwordResetCodeHash: null, passwordResetExpiresAt: null })
    .where(eq(users.id, user.id))

  return { ok: true as const }
}
