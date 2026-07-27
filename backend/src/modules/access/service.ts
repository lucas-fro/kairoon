import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, gt, isNull } from 'drizzle-orm'

import { db } from '../../db'
import { employees, establishments, staffInvites, users } from '../../db/schema'
import { APP_URL } from '../../lib/appUrl'
import { AppError } from '../../lib/errors'
import { DEFAULT_STAFF_PERMISSIONS, isPermission } from '../../lib/permissions'
import { notify } from '../../notifications/dispatcher'
import type { AcceptInviteInput } from './schemas'

/** Validade do convite. Passou disso, o dono reenvia (o link antigo morre). */
const INVITE_TTL_DAYS = 7

/**
 * O token viaja no link e é guardado só como hash: vazamento do banco não
 * permite entrar como ninguém. Diferente do token de agendamento
 * (lib/appointmentToken.ts), aqui o estado é obrigatório, porque convite precisa
 * expirar, valer uma vez só e ser revogável.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } }
  return e.code === '23505' || e.cause?.code === '23505'
}

function inviteUrl(token: string): string {
  return `${APP_URL}/convite?t=${token}`
}

/** Ficha do estabelecimento, com as checagens comuns a tudo que mexe em acesso. */
async function getManageableEmployee(establishmentId: string, employeeId: string) {
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, employeeId), eq(employees.establishmentId, establishmentId)),
  })
  if (!employee) throw new AppError('Profissional não encontrado', 404)
  // O dono não recebe convite nem tem permissões editáveis: ele é a origem
  // delas. Sem esta trava, dava para o dono se rebaixar e travar a própria conta.
  if (employee.isOwner) {
    throw new AppError('O dono da conta não tem acesso gerenciável.', 409)
  }
  return employee
}

/**
 * Envia (ou reenvia) o convite de acesso ao painel.
 *
 * Reenviar revoga o convite aberto anterior: só existe um link válido por vez,
 * garantido também pelo índice único parcial da tabela.
 */
export async function sendInvite(establishmentId: string, employeeId: string) {
  const employee = await getManageableEmployee(establishmentId, employeeId)

  if (employee.userId) {
    throw new AppError('Este profissional já tem acesso ao painel.', 409)
  }
  if (!employee.active) {
    throw new AppError('Ative o profissional antes de conceder acesso.', 409)
  }
  const email = employee.email?.toLowerCase().trim()
  if (!email) {
    throw new AppError('Cadastre o e-mail do profissional antes de enviar o convite.', 400)
  }

  // E-mail é a identidade da conta e é único no sistema inteiro. Enquanto uma
  // conta pertence a um estabelecimento só, quem já tem login em outro lugar
  // precisa de outro e-mail. A mensagem explica em vez de dar 500 na constraint.
  const existingUser = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.email, email),
  })
  if (existingUser) {
    throw new AppError(
      'Este e-mail já pertence a outra conta Kairoon. Cadastre outro e-mail para este profissional.',
      409,
    )
  }

  const establishment = await db.query.establishments.findFirst({
    columns: { name: true },
    where: eq(establishments.id, establishmentId),
  })

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(staffInvites)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(staffInvites.employeeId, employeeId),
            isNull(staffInvites.acceptedAt),
            isNull(staffInvites.revokedAt),
          ),
        )
      await tx.insert(staffInvites).values({
        establishmentId,
        employeeId,
        email,
        tokenHash: hashToken(token),
        expiresAt,
      })
    })
  } catch (err) {
    // Dois cliques simultâneos em "enviar convite": o índice único parcial
    // (um convite aberto por ficha) barra o segundo. É conflito de uso, não
    // erro do servidor.
    if (isUniqueViolation(err)) {
      throw new AppError('Um convite acabou de ser enviado para este profissional.', 409)
    }
    throw err
  }

  void notify(
    'staff_invite',
    { email },
    {
      name: employee.name,
      establishmentName: establishment?.name ?? 'Kairoon',
      inviteUrl: inviteUrl(token),
      expiresInDays: INVITE_TTL_DAYS,
    },
    { key: `staff_invite:${employeeId}:${expiresAt.getTime()}` },
  )

  return { ok: true as const, expiresAt }
}

/** Cancela o convite aberto sem mexer na ficha. O link enviado para de valer. */
export async function revokeInvite(establishmentId: string, employeeId: string) {
  await getManageableEmployee(establishmentId, employeeId)

  const revoked = await db
    .update(staffInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(staffInvites.employeeId, employeeId),
        isNull(staffInvites.acceptedAt),
        isNull(staffInvites.revokedAt),
      ),
    )
    .returning({ id: staffInvites.id })

  if (revoked.length === 0) throw new AppError('Não há convite pendente para este profissional', 404)
  return { ok: true as const }
}

/**
 * Tira o acesso de quem já entrou: apaga a CONTA de login, não a ficha. O
 * `onDelete: 'set null'` de employees.userId preserva o profissional, a agenda e
 * todo o histórico dele.
 */
export async function revokeAccess(establishmentId: string, employeeId: string) {
  const employee = await getManageableEmployee(establishmentId, employeeId)
  if (!employee.userId) throw new AppError('Este profissional não tem acesso ao painel', 404)

  await db.delete(users).where(eq(users.id, employee.userId))
  return { ok: true as const }
}

/** Substitui as permissões da ficha. Só o dono chega aqui (rota 'owner'). */
export async function updatePermissions(
  establishmentId: string,
  employeeId: string,
  permissions: string[],
) {
  await getManageableEmployee(establishmentId, employeeId)

  // Dedup + ordem estável: a comparação com os presets no frontend é por
  // conjunto, mas guardar sujo tornaria qualquer diff do banco ilegível.
  const clean = [...new Set(permissions.filter(isPermission))].sort()

  const [updated] = await db
    .update(employees)
    .set({ permissions: clean })
    .where(and(eq(employees.id, employeeId), eq(employees.establishmentId, establishmentId)))
    .returning()

  return { id: updated.id, permissions: updated.permissions }
}

// --- Aceite do convite (público) -------------------------------------------

async function findOpenInvite(token: string) {
  return db.query.staffInvites.findFirst({
    where: and(
      eq(staffInvites.tokenHash, hashToken(token)),
      isNull(staffInvites.acceptedAt),
      isNull(staffInvites.revokedAt),
      gt(staffInvites.expiresAt, new Date()),
    ),
    with: { employee: true, establishment: { columns: { id: true, name: true } } },
  })
}

/**
 * Dados mínimos para a tela de aceite: quem é e onde vai trabalhar. Não devolve
 * nada sensível, e a mesma mensagem cobre token inválido, expirado, revogado ou
 * já usado (não vale a pena distinguir para quem só tem o link).
 */
export async function getInvite(token: string) {
  const invite = await findOpenInvite(token)
  if (!invite || !invite.employee.active) {
    throw new AppError('Convite inválido ou expirado', 404)
  }
  return {
    name: invite.employee.name,
    email: invite.email,
    establishmentName: invite.establishment.name,
    expiresAt: invite.expiresAt,
  }
}

/** Cria a conta do funcionário e liga na ficha. Devolve a sessão já pronta. */
export async function acceptInvite(input: AcceptInviteInput) {
  const invite = await findOpenInvite(input.token)
  if (!invite || !invite.employee.active) {
    throw new AppError('Convite inválido ou expirado', 404)
  }
  if (invite.employee.userId) {
    throw new AppError('Este profissional já tem acesso ao painel.', 409)
  }

  const existingUser = await db.query.users.findFirst({
    columns: { id: true },
    where: eq(users.email, invite.email),
  })
  if (existingUser) {
    throw new AppError('Já existe uma conta com este e-mail', 409)
  }

  const passwordHash = await bcrypt.hash(input.password, 10)
  const now = new Date()

  const result = await db.transaction(async (tx) => {
    // O convite pode ter sido revogado, reenviado ou aceito enquanto o bcrypt
    // rodava (centenas de ms). Consumir por id EXIGINDO que ele siga aberto
    // fecha essa janela: se outra transação já o consumiu, saímos aqui.
    const consumed = await tx
      .update(staffInvites)
      .set({ acceptedAt: now })
      .where(
        and(
          eq(staffInvites.id, invite.id),
          isNull(staffInvites.acceptedAt),
          isNull(staffInvites.revokedAt),
          gt(staffInvites.expiresAt, now),
        ),
      )
      .returning({ id: staffInvites.id })
    if (consumed.length === 0) throw new AppError('Convite inválido ou expirado', 404)

    const [user] = await tx
      .insert(users)
      .values({
        name: invite.employee.name,
        email: invite.email,
        passwordHash,
        phone: invite.employee.phone,
        termsAcceptedAt: now,
      })
      .returning()

    // Relê a ficha DENTRO da transação: o dono pode ter ajustado as permissões
    // entre o clique no link e o envio da senha, e vale a configuração atual.
    const currentEmployee = await tx.query.employees.findFirst({
      where: eq(employees.id, invite.employeeId),
      columns: { permissions: true },
    })
    // Sem permissão configurada pelo dono, entra no preset mais restrito
    // (Profissional): vê só a própria agenda, em leitura.
    const permissions =
      currentEmployee && currentEmployee.permissions.length > 0
        ? currentEmployee.permissions
        : [...DEFAULT_STAFF_PERMISSIONS]

    const [employee] = await tx
      .update(employees)
      .set({ userId: user.id, permissions })
      .where(and(eq(employees.id, invite.employeeId), isNull(employees.userId)))
      .returning()

    // A ficha ganhou dono entre o findOpenInvite e o update: aborta em vez de
    // deixar a conta órfã (o rollback desfaz o insert de users).
    if (!employee) throw new AppError('Este profissional já tem acesso ao painel.', 409)

    return { user, employee }
  })

  // Só as chaves da sessão: quem monta o payload de login é o módulo de auth
  // (getProfile), para o aceite devolver exatamente o mesmo formato do /login.
  return { userId: result.user.id, establishmentId: result.employee.establishmentId }
}
