import type { FastifyInstance } from 'fastify'
import { PERMISSION_PRESETS, PERMISSIONS } from '../../lib/permissions'
import * as authService from '../auth/service'
import {
  acceptInviteSchema,
  employeeIdParamSchema,
  inviteTokenParamSchema,
  updatePermissionsSchema,
} from './schemas'
import * as accessService from './service'

/**
 * Convites e permissões da equipe.
 *
 * TUDO aqui é 'owner': nem o switch `admin` alcança, de propósito. Um
 * administrador capaz de se auto-promover ou de tirar o acesso do dono não seria
 * administrador, seria dono (ver lib/permissions.ts).
 */
export async function accessRoutes(app: FastifyInstance) {
  // Catálogo e presets vindos do servidor: a UI monta o diálogo com a mesma
  // fonte que o gate usa, sem chance de a tela oferecer switch que não existe.
  app.get('/catalog', { config: { permission: 'owner' } }, async () => ({
    permissions: PERMISSIONS,
    presets: PERMISSION_PRESETS,
  }))

  app.post('/employees/:employeeId/invite', { config: { permission: 'owner' } }, async (request) => {
    const { employeeId } = employeeIdParamSchema.parse(request.params)
    return accessService.sendInvite(request.auth.establishmentId, employeeId)
  })

  app.delete('/employees/:employeeId/invite', { config: { permission: 'owner' } }, async (request) => {
    const { employeeId } = employeeIdParamSchema.parse(request.params)
    return accessService.revokeInvite(request.auth.establishmentId, employeeId)
  })

  app.delete('/employees/:employeeId/access', { config: { permission: 'owner' } }, async (request) => {
    const { employeeId } = employeeIdParamSchema.parse(request.params)
    return accessService.revokeAccess(request.auth.establishmentId, employeeId)
  })

  app.put('/employees/:employeeId/permissions', { config: { permission: 'owner' } }, async (request) => {
    const { employeeId } = employeeIdParamSchema.parse(request.params)
    const { permissions } = updatePermissionsSchema.parse(request.body)
    return accessService.updatePermissions(request.auth.establishmentId, employeeId, permissions)
  })

  // --- Aceite do convite: público, quem chega aqui ainda não tem conta -------

  app.get(
    '/invite/:token',
    { config: { permission: 'public', rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (request) => {
      const { token } = inviteTokenParamSchema.parse(request.params)
      return accessService.getInvite(token)
    },
  )

  app.post(
    '/invite/accept',
    { config: { permission: 'public', rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const input = acceptInviteSchema.parse(request.body)
      const { userId, establishmentId } = await accessService.acceptInvite(input)
      const token = app.jwt.sign({ sub: userId, establishmentId })
      const { user, establishment } = await authService.getProfile(userId)
      return reply.status(201).send({ token, user, establishment })
    },
  )
}
