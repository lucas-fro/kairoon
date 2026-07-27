import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../../db'
import { commissionEntries, employees } from '../../db/schema'
import { todayStr } from '../../lib/datetime'
import { AppError } from '../../lib/errors'
import type { AuthContext } from '../../plugins/auth'
import type { CommissionsQuery } from './schemas'

/**
 * Comissões apuradas no período, agregadas por profissional. Só entram
 * atendimentos concluídos (uma linha de comissão por agendamento). Default do
 * período: início do mês corrente até hoje.
 *
 * Quem NÃO tem `finance.payroll` vê apenas a própria comissão: é o dinheiro
 * dele, e esconder isso do profissional não protege ninguém. Ver a dos colegas,
 * sim, é folha de pagamento e exige a permissão.
 */
export async function getCommissionsReport(
  establishmentId: string,
  query: CommissionsQuery,
  auth: AuthContext,
) {
  const today = todayStr()
  const from = query.from ?? `${today.slice(0, 8)}01`
  const to = query.to ?? today

  if (from > to) throw new AppError('Data inicial não pode ser maior que a data final', 400)

  const ownOnly = auth.permissions.has('finance.payroll')
    ? undefined
    : eq(commissionEntries.employeeId, auth.employeeId)

  const rows = await db
    .select({
      employeeId: commissionEntries.employeeId,
      employeeName: employees.name,
      count: sql<string>`count(*)`,
      baseCents: sql<string>`coalesce(sum(${commissionEntries.baseCents}), 0)`,
      commissionCents: sql<string>`coalesce(sum(${commissionEntries.commissionCents}), 0)`,
    })
    .from(commissionEntries)
    .innerJoin(employees, eq(commissionEntries.employeeId, employees.id))
    .where(
      and(
        eq(commissionEntries.establishmentId, establishmentId),
        gte(commissionEntries.date, from),
        lte(commissionEntries.date, to),
        ownOnly,
      ),
    )
    .groupBy(commissionEntries.employeeId, employees.name)
    .orderBy(desc(sql`sum(${commissionEntries.commissionCents})`))

  const byEmployee = rows.map((row) => ({
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    count: Number(row.count),
    baseCents: Number(row.baseCents),
    commissionCents: Number(row.commissionCents),
  }))

  return {
    summary: {
      totalCents: byEmployee.reduce((acc, e) => acc + e.commissionCents, 0),
      count: byEmployee.reduce((acc, e) => acc + e.count, 0),
    },
    byEmployee,
  }
}
