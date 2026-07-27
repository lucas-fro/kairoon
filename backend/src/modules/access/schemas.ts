import { z } from 'zod'
import { isPermission } from '../../lib/permissions'

export const employeeIdParamSchema = z.object({
  employeeId: z.string().uuid('Profissional inválido'),
})

export const updatePermissionsSchema = z.object({
  // Aceita só chaves conhecidas do catálogo: um cliente adulterado não inventa
  // permissão nova nem cola aqui as implícitas (que são derivadas, não salvas).
  permissions: z
    .array(z.string())
    .max(50)
    .refine((list) => list.every(isPermission), 'Permissão desconhecida'),
})

export const inviteTokenParamSchema = z.object({
  token: z.string().trim().min(20, 'Convite inválido').max(200, 'Convite inválido'),
})

export const acceptInviteSchema = z.object({
  token: z.string().trim().min(20, 'Convite inválido').max(200, 'Convite inválido'),
  password: z.string().min(6, 'A senha deve ter no mínimo 6 caracteres'),
  // Mesmo aceite exigido no cadastro do dono (registrado em users.termsAcceptedAt).
  acceptedLegal: z.boolean().refine((value) => value === true, {
    message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade',
  }),
})

export type UpdatePermissionsInput = z.infer<typeof updatePermissionsSchema>
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>
