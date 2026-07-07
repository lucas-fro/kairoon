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

/**
 * Serializa resgates do mesmo cupom: a recontagem de usos (maxUses /
 * usesPerClient) é check-then-insert e precisa do lock para não estourar o
 * limite com duas finalizações concorrentes. Adquirir sempre DEPOIS de
 * lockEmployeeDay (quando ambos ocorrem) para evitar deadlock.
 */
export async function lockCoupon(tx: SqlExecutor, couponId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coupon:${couponId}`}))`)
}

/**
 * Serializa resgates de fidelidade/pontos do mesmo cliente: a checagem de
 * carimbos disponíveis / saldo de pontos é check-then-insert.
 */
export async function lockClientLoyalty(tx: SqlExecutor, clientId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`loyalty:${clientId}`}))`)
}
