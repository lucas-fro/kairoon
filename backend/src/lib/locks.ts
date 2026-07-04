import { sql, type SQL } from 'drizzle-orm'

interface SqlExecutor {
  execute: (query: SQL) => Promise<unknown>
}

/**
 * Serializa reservas do mesmo profissional+dia dentro da transação corrente
 * (pg_advisory_xact_lock). Sem isso, duas transações concorrentes passam
 * ambas pela checagem check-then-insert de conflito antes de qualquer commit
 * e gravam agendamentos sobrepostos. O lock é liberado no commit/rollback.
 */
export async function lockEmployeeDay(tx: SqlExecutor, employeeId: string, date: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${employeeId}:${date}`}))`)
}
