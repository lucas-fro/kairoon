import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import { db } from '../../db'
import { employeeCommissions, employees, establishments, services } from '../../db/schema'
import { timeToMinutes } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
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

type EmployeeRow = typeof employees.$inferSelect
type CommissionRow = typeof employeeCommissions.$inferSelect
type Commission = { serviceId: string; value: number }

/** Achata as comissões (só serviceId + value) no objeto do profissional */
function shapeEmployee(row: EmployeeRow & { commissions?: CommissionRow[] }) {
  const { commissions, ...rest } = row
  return {
    ...rest,
    commissions: (commissions ?? []).map((c) => ({ serviceId: c.serviceId, value: c.value })),
  }
}

async function getEmployeeShaped(tx: DbTransaction, establishmentId: string, id: string) {
  const row = await tx.query.employees.findFirst({
    where: and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)),
    with: { commissions: true },
  })
  if (!row) throw new AppError('Profissional não encontrado', 404)
  return shapeEmployee(row)
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
  const others = await tx
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.establishmentId, establishmentId), ne(employees.id, source.id)))
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

export async function listEmployees(establishmentId: string) {
  const rows = await db.query.employees.findMany({
    where: eq(employees.establishmentId, establishmentId),
    orderBy: [asc(employees.createdAt)],
    with: { commissions: true },
  })
  return rows.map(shapeEmployee)
}

export async function createEmployee(establishmentId: string, input: CreateEmployeeInput) {
  const { applyScheduleToAll, applyCommissionToAll, commissions, ...data } = input
  validateSchedule(data)

  const establishment = await db.query.establishments.findFirst({
    where: eq(establishments.id, establishmentId),
    columns: { plan: true },
  })
  if (!establishment) throw new AppError('Estabelecimento não encontrado', 404)

  // Limite de profissionais temporariamente desativado (fase de testes)
  const FREE_EMPLOYEE_LIMIT = 99
  if (establishment.plan === 'free') {
    const rows = await db
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.establishmentId, establishmentId))
    if (rows.length >= FREE_EMPLOYEE_LIMIT) {
      throw new AppError('Limite de profissionais atingido para o seu plano.', 403)
    }
  }

  return db.transaction(async (tx) => {
    const [employee] = await tx
      .insert(employees)
      .values({ ...data, establishmentId })
      .returning()
    if (commissions) await replaceCommissions(tx, establishmentId, employee.id, commissions)
    if (applyScheduleToAll) await applyScheduleToOthers(tx, establishmentId, employee)
    if (applyCommissionToAll) await applyCommissionToOthers(tx, establishmentId, employee)
    return getEmployeeShaped(tx, establishmentId, employee.id)
  })
}

export async function updateEmployee(
  establishmentId: string,
  id: string,
  input: UpdateEmployeeInput,
) {
  const { applyScheduleToAll, applyCommissionToAll, commissions, ...data } = input
  const hasData = Object.keys(data).length > 0
  if (!hasData && commissions === undefined && !applyScheduleToAll && !applyCommissionToAll) {
    throw new AppError('Nenhum dado para atualizar', 400)
  }
  validateSchedule(data)

  return db.transaction(async (tx) => {
    let updated: EmployeeRow | undefined
    if (hasData) {
      const rows = await tx
        .update(employees)
        .set(data)
        .where(and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)))
        .returning()
      updated = rows[0]
    } else {
      updated = await tx.query.employees.findFirst({
        where: and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)),
      })
    }
    if (!updated) throw new AppError('Profissional não encontrado', 404)
    if (commissions !== undefined) await replaceCommissions(tx, establishmentId, id, commissions)
    if (applyScheduleToAll) await applyScheduleToOthers(tx, establishmentId, updated)
    if (applyCommissionToAll) await applyCommissionToOthers(tx, establishmentId, updated)
    return getEmployeeShaped(tx, establishmentId, id)
  })
}

export async function deleteEmployee(establishmentId: string, id: string) {
  try {
    const deleted = await db
      .delete(employees)
      .where(and(eq(employees.id, id), eq(employees.establishmentId, establishmentId)))
      .returning()
    if (deleted.length === 0) throw new AppError('Profissional não encontrado', 404)
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
