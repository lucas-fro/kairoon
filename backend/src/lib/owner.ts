import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '../db'
import { employees } from '../db/schema'

/**
 * "Quem é o dono daqui" em um lugar só.
 *
 * O estabelecimento não guarda mais um ownerId: o dono é a ficha com
 * isOwner = true (única por estabelecimento, garantido por índice), e a conta
 * dele é o userId dessa ficha. Quem precisar do dono passa por aqui em vez de
 * reinventar o caminho.
 */
export async function getOwnerUser(establishmentId: string) {
  const employee = await db.query.employees.findFirst({
    where: and(eq(employees.establishmentId, establishmentId), eq(employees.isOwner, true)),
    with: { user: true },
  })
  return employee?.user ?? null
}

/** Estabelecimentos dos quais esta conta é dona (hoje, no máximo um). */
export async function getOwnedEstablishmentIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ establishmentId: employees.establishmentId })
    .from(employees)
    .where(and(eq(employees.userId, userId), eq(employees.isOwner, true)))
  return rows.map((r) => r.establishmentId)
}

/**
 * Contas de login vinculadas a estes estabelecimentos (dono e equipe). Usado na
 * exclusão da conta: apagar o estabelecimento cascateia as fichas, mas os
 * `users` da equipe ficariam órfãos segurando e-mails que ninguém mais poderia
 * reutilizar (o e-mail é único no sistema).
 */
export async function getLinkedUserIds(establishmentIds: string[]): Promise<string[]> {
  if (establishmentIds.length === 0) return []
  const rows = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(
      and(
        inArray(employees.establishmentId, establishmentIds),
        isNotNull(employees.userId),
      ),
    )
  return [...new Set(rows.map((r) => r.userId).filter((id): id is string => id !== null))]
}
