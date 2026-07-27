/**
 * Catálogo de permissões da equipe: fonte ÚNICA da verdade de o que cada acesso
 * libera. Para mover um poder de lugar, mexa só aqui.
 *
 * O espelho para a UI vive em frontend/src/lib/permissions.ts (rótulos em
 * português e agrupamento das telas). Ao mexer neste arquivo, mexa nele também.
 *
 * Onde as permissões são guardadas: `employees.permissions` (jsonb). O dono
 * (employees.isOwner) ignora a coluna e recebe tudo, ver `resolvePermissions`.
 */

/** Permissões com switch próprio no diálogo do dono. */
export const PERMISSIONS = [
  // Agenda
  'agenda.view', // ver a agenda e os detalhes dos agendamentos
  'agenda.view_all', // ver a de TODOS; desligado = só a própria
  'agenda.create',
  'agenda.edit', // remarcar, trocar profissional, editar observações
  'agenda.cancel',
  'agenda.complete', // fechar comanda e receber pagamento
  // Clientes
  'clients.view',
  'clients.manage',
  // Catálogo
  'services.manage',
  'stock.view',
  'stock.manage',
  // Dinheiro
  'finance.view', // caixa, receitas, despesas, números do dashboard
  'finance.manage', // lançar/editar despesas e custos fixos
  'finance.payroll', // salários, folha e comissões da equipe
  'reports.view',
  // Marketing
  'marketing.view',
  'marketing.manage', // cupons, campanhas, fidelidade, pontos
  // Equipe e sistema
  'employees.view',
  'employees.manage',
  'settings.manage', // estabelecimento, expediente, aparência, bloqueios
  'admin', // liga tudo acima de uma vez
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Permissões SEM switch: são consequência de outra e existem para não quebrar
 * fluxos. Quem pode criar agendamento precisa achar (e às vezes cadastrar) o
 * cliente e escolher o serviço, mesmo sem ter a aba Clientes ou Serviços. Sem
 * isto, o preset "Profissional autônomo" seria inútil na prática.
 */
export const IMPLICIT_PERMISSIONS = [
  'clients.lookup', // buscar por nome/telefone e cadastrar no fluxo do agendamento
  'catalog.lookup', // consultar serviços, pacotes e produtos no fechamento
  // Ler cupons pessoais, carimbos e saldo de pontos DE UM cliente. Chega por
  // dois caminhos que não se implicam: quem fecha a comanda (precisa aplicar a
  // recompensa na hora) e quem cuida do marketing (precisa ver a ficha). Não dá
  // acesso à lista geral de cupons nem aos programas, que seguem em marketing.
  'fidelity.lookup',
] as const

export type ImplicitPermission = (typeof IMPLICIT_PERMISSIONS)[number]

/** Tudo que `has()` aceita: o que tem switch mais o que é derivado. */
export type AnyPermission = Permission | ImplicitPermission

/**
 * Fecho transitivo: conceder a chave concede também os valores. Cobre tanto o
 * óbvio (quem gerencia, vê) quanto as implícitas acima.
 */
const IMPLIES: Partial<Record<AnyPermission, AnyPermission[]>> = {
  // Sem a lista de profissionais a agenda simplesmente não desenha: são as
  // colunas do quadro e o seletor de profissional. O catálogo entra pelo mesmo
  // motivo (duração e nome do serviço montam o bloco na grade). Quem vê a
  // agenda precisa dos dois, mesmo sem ter as abas Equipe e Serviços.
  'agenda.view': ['employees.view', 'catalog.lookup'],
  'agenda.create': ['agenda.view', 'clients.lookup', 'catalog.lookup'],
  'agenda.edit': ['agenda.view', 'catalog.lookup'],
  'agenda.cancel': ['agenda.view'],
  'agenda.complete': ['agenda.view', 'clients.lookup', 'catalog.lookup', 'fidelity.lookup'],
  'agenda.view_all': ['agenda.view'],
  'clients.manage': ['clients.view', 'clients.lookup'],
  'clients.view': ['clients.lookup'],
  'stock.manage': ['stock.view', 'catalog.lookup'],
  'stock.view': ['catalog.lookup'],
  'services.manage': ['catalog.lookup'],
  'finance.manage': ['finance.view'],
  'finance.payroll': ['finance.view', 'employees.view'],
  'marketing.manage': ['marketing.view'],
  'marketing.view': ['fidelity.lookup'],
  'employees.manage': ['employees.view'],
}

/** Todas as permissões concedíveis, já com as implícitas. O dono recebe isto. */
const ALL_PERMISSIONS: AnyPermission[] = [...PERMISSIONS, ...IMPLICIT_PERMISSIONS]

/**
 * Poderes que NUNCA saem do dono, nem com o switch `admin` ligado:
 * plano/assinatura, exclusão da conta, dados pessoais do dono e a própria
 * gestão de acessos da equipe.
 *
 * O motivo é estrutural: um "administrador" capaz de se auto-promover, gastar o
 * cartão do dono ou trancá-lo para fora não é administrador, é dono. Nas rotas
 * isso aparece como `config.permission: 'owner'`.
 */
export const OWNER_ONLY = 'owner' as const

/** Rota liberada a qualquer sessão autenticada (perfil próprio, plano, logout). */
export const AUTHENTICATED = 'authenticated' as const

/** Rota sem autenticação (link público, login, aceite de convite). */
export const PUBLIC = 'public' as const

/** O que `config.permission` aceita numa rota. Ver o assert de boot em app.ts. */
export type RoutePermission = AnyPermission | typeof OWNER_ONLY | typeof AUTHENTICATED | typeof PUBLIC

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS)

const ROUTE_PERMISSION_SET = new Set<string>([...ALL_PERMISSIONS, OWNER_ONLY, AUTHENTICATED, PUBLIC])

/** A string é uma permissão conhecida? Usado ao validar o que o dono envia. */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

/** Valor aceito em `config.permission`. Validado no boot (ver app.ts). */
export function isRoutePermission(value: string): value is RoutePermission {
  return ROUTE_PERMISSION_SET.has(value)
}

/**
 * Expande uma lista guardada no banco para o conjunto efetivo, aplicando o
 * fecho transitivo do IMPLIES. `admin` vira tudo; dono idem.
 */
export function resolvePermissions(
  stored: string[] | null | undefined,
  opts?: { isOwner?: boolean },
): Set<AnyPermission> {
  if (opts?.isOwner) return new Set(ALL_PERMISSIONS)

  const granted = (stored ?? []).filter((p): p is AnyPermission => PERMISSION_SET.has(p))
  if (granted.includes('admin')) return new Set(ALL_PERMISSIONS)

  const result = new Set<AnyPermission>()
  const queue = [...granted]
  while (queue.length > 0) {
    const permission = queue.pop()
    if (!permission || result.has(permission)) continue
    result.add(permission)
    for (const implied of IMPLIES[permission] ?? []) queue.push(implied)
  }
  return result
}

export function hasPermission(granted: Set<AnyPermission>, permission: AnyPermission): boolean {
  return granted.has(permission)
}

// ---------------------------------------------------------------------------
// Presets: ponto de partida, não vínculo. O que fica salvo é sempre a lista de
// permissões; o nome do preset é DERIVADO na hora de exibir (ver presetKeyFor).
// Mudar a definição de um preset numa versão futura não mexe em quem já está
// salvo: permissão de quem já trabalha na casa não muda por deploy.
// ---------------------------------------------------------------------------

export interface PermissionPreset {
  key: string
  label: string
  description: string
  permissions: Permission[]
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    key: 'profissional',
    label: 'Profissional',
    description: 'Vê apenas a própria agenda, sem poder criar nem alterar nada.',
    permissions: ['agenda.view'],
  },
  {
    key: 'profissional_autonomo',
    label: 'Profissional autônomo',
    description: 'Cuida da própria agenda de ponta a ponta, sem ver a dos colegas.',
    permissions: ['agenda.view', 'agenda.create', 'agenda.edit', 'agenda.cancel', 'agenda.complete'],
  },
  {
    key: 'recepcao',
    label: 'Recepção',
    description: 'Agenda de todos e carteira de clientes. Sem financeiro nem configurações.',
    permissions: [
      'agenda.view',
      'agenda.view_all',
      'agenda.create',
      'agenda.edit',
      'agenda.cancel',
      'agenda.complete',
      'clients.view',
      'clients.manage',
      'stock.view',
      'marketing.view',
    ],
  },
  {
    key: 'gerente',
    label: 'Gerente',
    description: 'Toca o negócio inteiro, menos salários e folha da equipe.',
    permissions: [
      'agenda.view',
      'agenda.view_all',
      'agenda.create',
      'agenda.edit',
      'agenda.cancel',
      'agenda.complete',
      'clients.view',
      'clients.manage',
      'services.manage',
      'stock.view',
      'stock.manage',
      'finance.view',
      'finance.manage',
      'reports.view',
      'marketing.view',
      'marketing.manage',
      'employees.view',
      'employees.manage',
      'settings.manage',
    ],
  },
  {
    key: 'administrador',
    label: 'Administrador',
    description: 'Tudo, exceto plano, exclusão da conta e gestão de acessos (só o dono).',
    permissions: ['admin'],
  },
]

/** Preset cuja lista bate EXATAMENTE com a guardada; null = personalizado. */
export function presetKeyFor(stored: string[]): string | null {
  const current = new Set(stored)
  const preset = PERMISSION_PRESETS.find(
    (p) => p.permissions.length === current.size && p.permissions.every((perm) => current.has(perm)),
  )
  return preset?.key ?? null
}

/** Permissões de quem acabou de aceitar o convite sem o dono ter configurado nada. */
export const DEFAULT_STAFF_PERMISSIONS: Permission[] =
  PERMISSION_PRESETS[0].permissions
