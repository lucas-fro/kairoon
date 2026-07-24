import { randomBytes, randomInt } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../../db'
import { employees, establishments, users, workingHours } from '../../db/schema'
import { AppError } from '../../lib/errors'
import { sendPasswordResetEmail, sendWelcomeEmail } from '../../lib/mailer'
import { TRIAL_DAYS } from '../../lib/plan'
import type { LoginInput, RegisterInput, UpdateProfileInput } from './schemas'

/** Nome da constraint violada quando o erro é 23505 (unique); null caso contrário. */
function uniqueViolationConstraint(err: unknown): string | null {
  const e = err as {
    code?: string
    constraint?: string
    cause?: { code?: string; constraint?: string }
  }
  const code = e.code ?? e.cause?.code
  if (code !== '23505') return null
  return e.constraint ?? e.cause?.constraint ?? ''
}

/** Link público provisório de alta entropia até o dono escolher o próprio. */
function provisionalSlug(): string {
  return `negocio-${randomBytes(4).toString('hex')}`
}

/** Código de redefinição de senha válido por 5 minutos. */
const RESET_CODE_TTL_MS = 5 * 60 * 1000

/** Máximo de tentativas erradas antes de queimar o código atual (anti-brute-force). */
const MAX_RESET_ATTEMPTS = 5

/**
 * Hash bcrypt "de mentira" (senha impossível de casar) usado para gastar tempo
 * comparando quando não há código ativo, assim o tempo de resposta não denuncia
 * se o e-mail existe / tem um código pendente.
 */
const DUMMY_RESET_HASH = bcrypt.hashSync('kairoon-uniform-timing-placeholder', 10)

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

/**
 * Cria o dono + estabelecimento e inicia o teste grátis (sem cartão).
 *
 * No fluxo novo, `input.establishment` é OMITIDO (a conta nasce só com os dados
 * pessoais e um link público provisório autogerado; o dono completa o negócio
 * nas etapas seguintes). Se vier preenchido (fluxo completo/legado), usamos como
 * está. `trialEndsAt = agora + TRIAL_DAYS` e `termsAcceptedAt = agora` são
 * setados no servidor. Nunca vêm do cliente.
 */
export async function registerOwner(input: RegisterInput) {
  const email = input.email.toLowerCase().trim()

  const existingUser = await db.query.users.findFirst({ where: eq(users.email, email) })
  if (existingUser) throw new AppError('Já existe uma conta com este e-mail', 409)

  const business = input.establishment
  if (business) {
    const existingSlug = await db.query.establishments.findFirst({
      where: eq(establishments.slug, business.slug),
    })
    if (existingSlug) throw new AppError('Este link já está em uso, escolha outro', 409)
  }

  const passwordHash = await bcrypt.hash(input.password, 10)
  const now = new Date()
  const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
  const businessName = business ? business.name.trim() : 'Meu negócio'
  const welcomeMessage = business
    ? `Bem-vindo(a)! Agende seu horário na ${businessName} em poucos cliques.`
    : 'Bem-vindo(a)! Agende seu horário em poucos cliques.'

  // Slug provisório é aleatório (colisão astronômica), mas retentamos o insert
  // inteiro em 23505 por robustez. Com negócio informado, o slug é fixo (1 try).
  const maxAttempts = business ? 1 : 5
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = business ? business.slug : provisionalSlug()
    try {
      const result = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            name: input.name.trim(),
            email,
            passwordHash,
            cpf: input.cpf,
            phone: input.phone,
            termsAcceptedAt: now,
          })
          .returning()

        const [establishment] = await tx
          .insert(establishments)
          .values({
            ownerId: user.id,
            name: businessName,
            slug,
            businessType: business?.businessType ?? 'outro',
            phone: business?.phone,
            email: business?.email,
            socials: business?.socials,
            document: business?.document,
            address: business?.address,
            addressNumber: business?.addressNumber,
            neighborhood: business?.neighborhood,
            city: business?.city,
            state: business?.state,
            cep: business?.cep,
            quiz: input.quiz,
            welcomeMessage,
            trialEndsAt,
          })
          .returning()

        await tx.insert(workingHours).values(
          DEFAULT_WORKING_HOURS.map((wh) => ({ ...wh, establishmentId: establishment.id })),
        )

        // O primeiro (e único, no início) profissional é o próprio dono.
        // isOwner: aparece com a coroa no painel, não pode ser excluído e só
        // tem jornada/ativo editáveis (ver modules/employees/service.ts).
        await tx
          .insert(employees)
          .values({ establishmentId: establishment.id, name: input.name.trim(), isOwner: true })

        return { user: sanitizeUser(user), establishment }
      })

      // E-mail de boas-vindas: fire-and-forget (nunca trava nem falha o cadastro).
      // Sem negócio informado (fluxo em etapas), não cita o nome placeholder.
      void sendWelcomeEmail(
        result.user.email,
        result.user.name,
        business ? result.establishment.name : null,
      ).catch((err) => console.error('[auth] falha ao enviar e-mail de boas-vindas:', err))

      return result
    } catch (err) {
      const constraint = uniqueViolationConstraint(err)
      if (constraint === null) throw err
      // E-mail em corrida (passou no pré-check e colidiu no insert): 409 claro.
      if (constraint.includes('email')) {
        throw new AppError('Já existe uma conta com este e-mail', 409)
      }
      // Colisão de slug: provisório tenta outro; informado pede outro link.
      if (!business) {
        lastError = err
        continue
      }
      throw new AppError('Este link já está em uso, escolha outro', 409)
    }
  }

  throw lastError ?? new AppError('Não foi possível criar a conta. Tente novamente.', 500)
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

  // O profissional-dono espelha o nome da conta (o nome não é editável na ficha
  // do profissional dono; ver modules/employees). Ao renomear a conta, mantemos
  // a coroa e a ficha em sincronia.
  if (data.name !== undefined) {
    await db
      .update(employees)
      .set({ name: data.name })
      .where(
        and(
          eq(employees.isOwner, true),
          inArray(
            employees.establishmentId,
            db
              .select({ id: establishments.id })
              .from(establishments)
              .where(eq(establishments.ownerId, userId)),
          ),
        ),
      )
  }

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
 * (ok). Não revela se o e-mail existe (evita enumeração de contas). O envio é
 * fire-and-forget para não vazar existência por erro/tempo de resposta.
 */
export async function requestPasswordResetByEmail(email: string) {
  const normalized = email.toLowerCase().trim()
  const user = await db.query.users.findFirst({ where: eq(users.email, normalized) })

  if (user) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    const passwordResetCodeHash = await bcrypt.hash(code, 10)
    const passwordResetExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS)

    // Zera o contador de tentativas ao emitir um código novo.
    await db
      .update(users)
      .set({ passwordResetCodeHash, passwordResetExpiresAt, passwordResetAttempts: 0 })
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
 * consumi-lo. Retorna null em qualquer falha: o chamador devolve sempre a mesma
 * mensagem, sem distinguir e-mail inexistente de código errado. Sempre compara um
 * hash (dummy quando não há código ativo) para o tempo de resposta ser uniforme, e
 * conta cada tentativa errada, queimando o código após o limite (anti-brute-force).
 */
async function findUserForResetCode(email: string, code: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email.toLowerCase().trim()),
  })

  const storedHash = user?.passwordResetCodeHash
  const notExpired = Boolean(
    user?.passwordResetExpiresAt && user.passwordResetExpiresAt.getTime() >= Date.now(),
  )
  const hasActiveCode = Boolean(storedHash) && notExpired

  // Comparação sempre executada (timing uniforme), contra o hash real ou o dummy.
  const matches = await bcrypt.compare(
    code,
    hasActiveCode && storedHash ? storedHash : DUMMY_RESET_HASH,
  )

  if (user && hasActiveCode && matches) return user

  // Tentativa errada num código ativo: incrementa e queima após o limite.
  if (user && hasActiveCode) {
    const attempts = (user.passwordResetAttempts ?? 0) + 1
    await db
      .update(users)
      .set(
        attempts >= MAX_RESET_ATTEMPTS
          ? { passwordResetCodeHash: null, passwordResetExpiresAt: null, passwordResetAttempts: 0 }
          : { passwordResetAttempts: attempts },
      )
      .where(eq(users.id, user.id))
  }

  return null
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
    .set({
      passwordHash,
      passwordResetCodeHash: null,
      passwordResetExpiresAt: null,
      passwordResetAttempts: 0,
    })
    .where(eq(users.id, user.id))

  return { ok: true as const }
}
