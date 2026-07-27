import fastifyJwt from '@fastify/jwt'
import { eq } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { db } from '../db'
import { employees } from '../db/schema'
import { env } from '../env'
import { AppError } from '../lib/errors'
import type { AnyPermission } from '../lib/permissions'
import { resolvePermissions } from '../lib/permissions'

export interface AuthTokenPayload {
  sub: string
  establishmentId: string
}

/**
 * Quem está fazendo a requisição, já resolvido.
 *
 * As permissões NÃO viajam no JWT de propósito: o token dura 7 dias e o dono
 * precisa conseguir revogar um acesso agora, não na semana que vem. O custo é
 * uma query por request (PK/índice único), e o ganho é que desativar a ficha ou
 * a conta derruba o acesso no request seguinte.
 */
export interface AuthContext {
  userId: string
  establishmentId: string
  /** Ficha do profissional vinculada à conta. Todo login tem uma. */
  employeeId: string
  isOwner: boolean
  permissions: Set<AnyPermission>
  /**
   * Escopo da agenda: null = vê a de todos; preenchido = vê só a deste
   * profissional. Os serviços usam isto em vez de confiar no query param.
   */
  agendaScopeEmployeeId: string | null
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload
    user: AuthTokenPayload
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply?: FastifyReply) => Promise<void>
    /** Resolve o contexto e exige a permissão; usado pelo gate global do app.ts. */
    requirePermission: (request: FastifyRequest, permission: string) => Promise<void>
  }
}

/**
 * Carrega a ficha + a conta a partir do `sub` do token e monta o contexto.
 * Qualquer inconsistência derruba a sessão com 401: ficha inexistente (acesso
 * revogado), conta ou ficha inativa (desligamento), ou token apontando para um
 * estabelecimento que não é o da ficha.
 */
export async function resolveAuthContext(payload: AuthTokenPayload): Promise<AuthContext> {
  const employee = await db.query.employees.findFirst({
    where: eq(employees.userId, payload.sub),
    with: { user: { columns: { id: true, active: true } } },
  })

  if (!employee || !employee.user) throw new AppError('Seu acesso foi removido', 401)
  if (!employee.user.active) throw new AppError('Sua conta está desativada', 401)
  // Ficha inativa corta o acesso da EQUIPE (é assim que se desliga alguém), mas
  // nunca o do dono: para ele, inativo significa só "não atende clientes", e a
  // conta é dele. Sem esta exceção, um gerente desativaria a ficha do dono e o
  // trancaria para fora do próprio negócio, e o dono se trancaria sozinho ao se
  // tirar da agenda.
  if (!employee.active && !employee.isOwner) {
    throw new AppError('Seu acesso foi desativado', 401)
  }
  if (employee.establishmentId !== payload.establishmentId) {
    throw new AppError('Não autorizado', 401)
  }

  const permissions = resolvePermissions(employee.permissions, { isOwner: employee.isOwner })
  return {
    userId: payload.sub,
    establishmentId: employee.establishmentId,
    employeeId: employee.id,
    isOwner: employee.isOwner,
    permissions,
    agendaScopeEmployeeId: permissions.has('agenda.view_all') ? null : employee.id,
  }
}

export const authPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  })

  app.decorate('authenticate', async (request: FastifyRequest) => {
    if (request.auth) return
    try {
      await request.jwtVerify()
    } catch {
      throw new AppError('Não autorizado', 401)
    }
    request.auth = await resolveAuthContext(request.user)
  })

  app.decorate('requirePermission', async (request: FastifyRequest, permission: string) => {
    await app.authenticate(request)

    if (permission === 'authenticated') return
    if (request.auth.isOwner) return

    if (permission === 'owner') {
      throw new AppError(
        'Somente o dono da conta pode fazer isso.',
        403,
        'OWNER_ONLY',
      )
    }
    if (!request.auth.permissions.has(permission as AnyPermission)) {
      throw new AppError('Você não tem permissão para isso.', 403, 'FORBIDDEN')
    }
  })

  // `auth` só é preenchido pelo authenticate; declarar aqui evita que o acesso a
  // request.auth mude o shape do objeto a cada requisição. O cast existe porque
  // o decorator nasce vazio, mas quem lê já passou pelo gate de permissão.
  app.decorateRequest('auth', null as unknown as AuthContext)
})
