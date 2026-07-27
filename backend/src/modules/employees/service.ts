import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '../../db'
import { employeeCommissions, employees, services, staffInvites, users } from '../../db/schema'
import { timeToMinutes } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import { getEffectivePlan } from '../../lib/plan'
import { planEmployeeLimit } from '../../lib/plans'
import type { AuthContext } from '../../plugins/auth'
import type { CreateEmployeeInput, UpdateEmployeeInput } from './schemas'

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function isForeignKeyViolation(err: unknown): boolean {
  const error = err as { code?: string; cause?: { code?: string } }
  return error.code === '23503' || error.cause?.code === '23503'
}

function validateSchedule(data: { workStart?: string; workEnd?: string; lunchStart?: string | null; lunchEnd?: string | null }) {
  if (data.workStart && data.workEnd && timeToMinutes(data.workStart) >= timeToMinutes(data.workEnd)) {
    throw new AppError('O horário de entrada deve ser anterior ao de saída', 400)
  }
  if (data.lunchStart && data.lunchEnd && timeToMinutes(data.lunchStart) >= timeToMinutes(data.lunchEnd)) {
    throw new AppError('O início do almoço deve ser anterior ao fim', 400)
  }
}

function validatePayroll(data: { paymentDays?: { day: number; amountCents: number }[] }) {
  if (data.paymentDays && data.paymentDays.length > 1) {
    const days = data.paymentDays.map((p) => p.day)
    if (new Set(days).size !== days.length) {
      throw new AppError('Os dois dias de pagamento devem ser diferentes', 400)
    }
  }
}

// Campos editáveis do profissional dono: só a jornada e o status (ativo).
// Nome/contato/foto espelham a conta; comissão e folha do dono não fazem sentido
// (é dele o negócio). É a garantia no servidor — a UI só reforça.
const OWNER_EDITABLE_KEYS = [
  'workStart',
  'workEnd',
  'lunchStart',
  'lunchEnd',
  'workDays',
  'active',
  // O dono também pode não atender clientes (só administrar): sair da agenda
  // não tem nada a ver com deixar de ser dono.
  'bookable',
] as const

type EmployeeUpdateData = Omit<
  UpdateEmployeeInput,
  'applyScheduleToAll' | 'applyCommissionToAll' | 'commissions'
>

/** Mantém só os campos que o dono pode alterar, descartando o resto. */
function pickOwnerEditable(data: EmployeeUpdateData): EmployeeUpdateData {
  const result: Record<string, unknown> = {}
  for (const key of OWNER_EDITABLE_KEYS) {
    if (data[key] !== undefined) result[key] = data[key]
  }
  return result as EmployeeUpdateData
}

type EmployeeRow = typeof employees.$inferSelect
type CommissionRow = typeof employeeCommissions.$inferSelect
type Commission = { serviceId: string; value: number }

/**
 * Situação do acesso ao painel, derivada (não é coluna):
 * 'active' já entrou, 'invited' convite em aberto, 'expired' convite venceu sem
 * uso, 'none' nunca foi convidado ou o acesso foi revogado.
 */
export type AccessStatus = 'none' | 'invited' | 'expired' | 'active'

interface AccessInfo {
  accessStatus: AccessStatus
  inviteExpiresAt: Date | null
}

/**
 * O que cada nível de acesso pode LER da ficha alheia.
 *
 * A lista de profissionais é lida por muita gente (a agenda não desenha sem
 * ela: `agenda.view` implica `employees.view`), e a ficha carrega salário,
 * benefícios, dias de pagamento e comissão. Sem esta redação, qualquer sessão
 * que abre a agenda leria a folha inteira da equipe.
 */
interface EmployeeVisibility {
  /** Salário, benefícios, dias de pagamento e comissões. */
  payroll: boolean
  /** Permissões guardadas e situação do acesso (só o dono gerencia isso). */
  access: boolean
}

export function visibilityFor(auth: AuthContext): EmployeeVisibility {
  return {
    payroll: auth.permissions.has('finance.payroll'),
    access: auth.isOwner,
  }
}

/** Campos de dinheiro da ficha, zerados para quem não tem `finance.payroll`. */
const REDACTED_PAYROLL = {
  salaryCents: null,
  bonuses: [] as { label: string; amountCents: number }[],
  vrCents: null,
  vtCents: null,
  vaCents: null,
  paymentDays: [] as { day: number; amountCents: number }[],
  commissionEnabled: false,
  commissionType: 'percent',
  commissions: [] as { serviceId: string; value: number }[],
}

/**
 * Achata as comissões (só serviceId + value) e anexa a situação do acesso,
 * redigindo o que o nível de acesso de quem pediu não alcança. O `userId` NUNCA
 * sai daqui: o painel só precisa saber se existe login, não qual é o id da conta.
 */
function shapeEmployee(
  row: EmployeeRow & { commissions?: CommissionRow[] },
  access: AccessInfo = { accessStatus: 'none', inviteExpiresAt: null },
  visibility: EmployeeVisibility = { payroll: true, access: true },
) {
  const { commissions, userId, ...rest } = row
  const base = {
    ...rest,
    commissions: (commissions ?? []).map((c) => ({ serviceId: c.serviceId, value: c.value })),
    hasLogin: userId !== null,
    ...access,
  }
  return {
    ...base,
    ...(visibility.payroll ? {} : REDACTED_PAYROLL),
    ...(visibility.access
      ? {}
      : { permissions: [], accessStatus: 'none' as AccessStatus, inviteExpiresAt: null }),
  }
}

/** Convite mais recente ainda em aberto de cada ficha do estabelecimento. */
async function openInvitesByEmployee(establishmentId: string) {
  const rows = await db
    .select({ employeeId: staffInvites.employeeId, expiresAt: staffInvites.expiresAt })
    .from(staffInvites)
    .where(
      and(
        eq(staffInvites.establishmentId, establishmentId),
        isNull(staffInvites.acceptedAt),
        isNull(staffInvites.revokedAt),
      ),
    )
  return new Map(rows.map((r) => [r.employeeId, r.expiresAt]))
}

function accessInfoFor(row: EmployeeRow, inviteExpiresAt: Date | undefined): AccessInfo {
  if (row.userId) return { accessStatus: 'active', inviteExpiresAt: null }
  if (!inviteExpiresAt) return { accessStatus: 'none', inviteExpiresAt: null }
  return {
    accessStatus: inviteExpiresAt.getTime() > Date.now() ? 'invited' : 'expired',
    inviteExpiresAt,
  }
}

async function getEmployeeShaped(
  tx: DbTransaction,
  establishmentId: string,
  id: string,
  visibility: EmployeeVisibility = { payroll: true, access: true },
) {
  const row = await tx.query.employees.findFirst({
    where: and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)),
    with: { commissions: true },
  })
  if (!row) throw new AppError('Profissional não encontrado', 404)

  const [invite] = await tx
    .select({ expiresAt: staffInvites.expiresAt })
    .from(staffInvites)
    .where(
      and(
        eq(staffInvites.employeeId, id),
        isNull(staffInvites.acceptedAt),
        isNull(staffInvites.revokedAt),
      ),
    )
  return shapeEmployee(row, accessInfoFor(row, invite?.expiresAt), visibility)
}

/** Copia a jornada de um profissional para todos os outros do estabelecimento */
async function applyScheduleToOthers(tx: DbTransaction, establishmentId: string, source: EmployeeRow) {
  await tx
    .update(employees)
    .set({
      workStart: source.workStart,
      workEnd: source.workEnd,
      lunchStart: source.lunchStart,
      lunchEnd: source.lunchEnd,
      workDays: source.workDays,
    })
    .where(and(eq(employees.establishmentId, establishmentId), ne(employees.id, source.id)))
}

/**
 * Substitui as comissões de um profissional. Ignora valores <= 0 e serviços que
 * não pertencem ao estabelecimento.
 */
async function replaceCommissions(
  tx: DbTransaction,
  establishmentId: string,
  employeeId: string,
  commissions: Commission[],
) {
  await tx.delete(employeeCommissions).where(eq(employeeCommissions.employeeId, employeeId))
  const valid = commissions.filter((c) => c.value > 0)
  if (valid.length === 0) return

  const owned = await tx
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.establishmentId, establishmentId),
        inArray(
          services.id,
          valid.map((c) => c.serviceId),
        ),
      ),
    )
  const ownedIds = new Set(owned.map((s) => s.id))
  const toInsert = valid.filter((c) => ownedIds.has(c.serviceId))
  if (toInsert.length === 0) return

  await tx
    .insert(employeeCommissions)
    .values(toInsert.map((c) => ({ employeeId, serviceId: c.serviceId, value: c.value })))
}

/** Replica a configuração de comissão de um profissional para todos os outros */
async function applyCommissionToOthers(tx: DbTransaction, establishmentId: string, source: EmployeeRow) {
  // O dono fica de fora: comissão "para si mesmo" não faz sentido, e é o mesmo
  // motivo pelo qual pickOwnerEditable não deixa editá-la na ficha dele.
  const others = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(
      and(
        eq(employees.establishmentId, establishmentId),
        ne(employees.id, source.id),
        eq(employees.isOwner, false),
      ),
    )
  if (others.length === 0) return

  const sourceCommissions = await tx
    .select({ serviceId: employeeCommissions.serviceId, value: employeeCommissions.value })
    .from(employeeCommissions)
    .where(eq(employeeCommissions.employeeId, source.id))

  for (const other of others) {
    await tx
      .update(employees)
      .set({ commissionEnabled: source.commissionEnabled, commissionType: source.commissionType })
      .where(eq(employees.id, other.id))
    await tx.delete(employeeCommissions).where(eq(employeeCommissions.employeeId, other.id))
    if (sourceCommissions.length > 0) {
      await tx
        .insert(employeeCommissions)
        .values(sourceCommissions.map((c) => ({ employeeId: other.id, serviceId: c.serviceId, value: c.value })))
    }
  }
}

export async function listEmployees(establishmentId: string, auth: AuthContext) {
  const visibility = visibilityFor(auth)
  const [rows, invites] = await Promise.all([
    db.query.employees.findMany({
      where: eq(employees.establishmentId, establishmentId),
      orderBy: [asc(employees.createdAt)],
      with: { commissions: true },
    }),
    // Só o dono gerencia acesso: para o resto nem consultamos os convites.
    visibility.access ? openInvitesByEmployee(establishmentId) : new Map<string, Date>(),
  ])
  return rows.map((row) =>
    shapeEmployee(row, accessInfoFor(row, invites.get(row.id)), visibility),
  )
}

/**
 * Campos de dinheiro que só quem tem `finance.payroll` pode gravar. Sem esta
 * poda, um gerente (que edita a ficha mas não enxerga a folha) salvaria o
 * formulário com os campos redigidos e APAGARIA o salário do colega.
 */
const PAYROLL_KEYS = [
  'salaryCents',
  'bonuses',
  'vrCents',
  'vtCents',
  'vaCents',
  'paymentDays',
  'commissionEnabled',
  'commissionType',
] as const

function stripPayroll<T extends Record<string, unknown>>(data: T): T {
  const result = { ...data }
  for (const key of PAYROLL_KEYS) delete result[key]
  return result
}

export async function createEmployee(
  establishmentId: string,
  input: CreateEmployeeInput,
  auth: AuthContext,
) {
  const visibility = visibilityFor(auth)
  const { applyScheduleToAll, applyCommissionToAll, commissions, ...raw } = input
  const data = visibility.payroll ? raw : stripPayroll(raw)
  const nextCommissions = visibility.payroll ? commissions : undefined
  validateSchedule(data)
  validatePayroll(data)

  // Limite de profissionais por plano (free: 1, básico: 5, essencial: ilimitado).
  const plan = await getEffectivePlan(establishmentId)
  const limit = planEmployeeLimit(plan)
  const currentCount = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.establishmentId, establishmentId))
  if (currentCount.length >= limit) {
    throw new AppError(
      'Limite de profissionais do seu plano atingido. Faça upgrade para adicionar mais.',
      403,
    )
  }

  return db.transaction(async (tx) => {
    const [employee] = await tx
      .insert(employees)
      .values({ ...data, establishmentId })
      .returning()
    if (nextCommissions) await replaceCommissions(tx, establishmentId, employee.id, nextCommissions)
    if (applyScheduleToAll) await applyScheduleToOthers(tx, establishmentId, employee)
    if (applyCommissionToAll && visibility.payroll) {
      await applyCommissionToOthers(tx, establishmentId, employee)
    }
    return getEmployeeShaped(tx, establishmentId, employee.id, visibility)
  })
}

export async function updateEmployee(
  establishmentId: string,
  id: string,
  input: UpdateEmployeeInput,
  auth: AuthContext,
) {
  const visibility = visibilityFor(auth)
  const { applyScheduleToAll, applyCommissionToAll, commissions, ...raw } = input
  // Quem não enxerga a folha também não a grava: senão salvar o formulário com
  // os campos redigidos apagaria salário e comissão do colega.
  const rest = visibility.payroll ? raw : stripPayroll(raw)

  return db.transaction(async (tx) => {
    const existing = await tx.query.employees.findFirst({
      where: and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)),
    })
    if (!existing) throw new AppError('Profissional não encontrado', 404)

    // Dono: só jornada e status. O resto (nome, contato, comissão, folha) é
    // ignorado, incluindo replicar comissão para todos.
    const isOwner = existing.isOwner
    const data = isOwner ? pickOwnerEditable(rest) : rest
    const nextCommissions = isOwner || !visibility.payroll ? undefined : commissions
    const applyCommission = isOwner || !visibility.payroll ? false : applyCommissionToAll

    const hasData = Object.keys(data).length > 0
    if (!hasData && nextCommissions === undefined && !applyScheduleToAll && !applyCommission) {
      throw new AppError('Nenhum dado para atualizar', 400)
    }
    validateSchedule(data)
    validatePayroll(data)

    let updated: EmployeeRow = existing
    if (hasData) {
      const rows = await tx
        .update(employees)
        .set(data)
        .where(and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)))
        .returning()
      updated = rows[0]
    }
    if (nextCommissions !== undefined) await replaceCommissions(tx, establishmentId, id, nextCommissions)
    if (applyScheduleToAll) await applyScheduleToOthers(tx, establishmentId, updated)
    if (applyCommission) await applyCommissionToOthers(tx, establishmentId, updated)
    return getEmployeeShaped(tx, establishmentId, id, visibility)
  })
}

export async function deleteEmployee(establishmentId: string, id: string, auth: AuthContext) {
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)),
  })
  if (!employee) throw new AppError('Profissional não encontrado', 404)

  // O dono é o profissional responsável pelo estabelecimento: nunca é excluído.
  if (employee.isOwner) {
    throw new AppError('O dono não pode ser excluído.', 409)
  }

  // Excluir a ficha leva junto a conta de login (abaixo), e tirar o acesso de
  // alguém é poder do dono, não de quem gerencia a equipe. Sem esta trava, um
  // gerente contornaria /access apagando a ficha do colega.
  if (employee.userId && !auth.isOwner) {
    throw new AppError(
      'Este profissional tem acesso ao painel. Somente o dono pode excluí-lo.',
      403,
      'OWNER_ONLY',
    )
  }

  // Invariante: um estabelecimento não pode ficar sem nenhum profissional.
  const remaining = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.establishmentId, establishmentId))
  if (remaining.length <= 1) {
    throw new AppError('O estabelecimento precisa de pelo menos um profissional.', 409)
  }

  try {
    await db.transaction(async (tx) => {
      // A conta de login vai junto: deixar o usuário órfão só criaria um acesso
      // que falha no login sem ninguém entender por quê.
      if (employee.userId) {
        await tx.delete(users).where(eq(users.id, employee.userId))
      }
      const deleted = await tx
        .delete(employees)
        .where(and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)))
        .returning()
      if (deleted.length === 0) throw new AppError('Profissional não encontrado', 404)
    })
  } catch (err) {
    if (err instanceof AppError) throw err
    if (isForeignKeyViolation(err)) {
      throw new AppError(
        'Este profissional possui agendamentos vinculados. Desative-o em vez de excluir.',
        409,
      )
    }
    throw err
  }
}
