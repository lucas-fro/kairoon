/**
 * Espelho do catálogo de permissões do backend (backend/src/lib/permissions.ts),
 * acrescido do que só interessa à tela: rótulo em português, explicação e
 * agrupamento por área.
 *
 * A REGRA de verdade é sempre a do servidor: aqui é só UX (esconder o que a
 * pessoa não pode usar). Ao mexer no catálogo lá, mexa aqui também.
 */

export const PERMISSIONS = [
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
  'finance.payroll',
  'reports.view',
  'marketing.view',
  'marketing.manage',
  'employees.view',
  'employees.manage',
  'settings.manage',
  'admin',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Derivadas de outra permissão; não têm switch (ver IMPLIES no backend).
 * `fidelity.lookup` = ler cupons/carimbos/pontos DE UM cliente, que chega tanto
 * por quem fecha a comanda quanto por quem cuida do marketing.
 */
export type ImplicitPermission = 'clients.lookup' | 'catalog.lookup' | 'fidelity.lookup'

export type AnyPermission = Permission | ImplicitPermission

export interface PermissionItem {
  key: Permission
  label: string
  hint: string
}

export interface PermissionGroup {
  label: string
  items: PermissionItem[]
}

/** Ordem e agrupamento dos switches no diálogo do dono. */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    label: 'Agenda',
    items: [
      { key: 'agenda.view', label: 'Ver a agenda', hint: 'Abrir a agenda e os detalhes dos atendimentos.' },
      {
        key: 'agenda.view_all',
        label: 'Ver a agenda de todos',
        hint: 'Desligado, enxerga apenas a própria agenda.',
      },
      { key: 'agenda.create', label: 'Criar agendamento', hint: 'Marcar horários para clientes.' },
      { key: 'agenda.edit', label: 'Editar agendamento', hint: 'Remarcar, trocar profissional e alterar observações.' },
      { key: 'agenda.cancel', label: 'Cancelar agendamento', hint: 'Cancelar horários já marcados.' },
      {
        key: 'agenda.complete',
        label: 'Finalizar atendimento',
        hint: 'Fechar comanda, receber pagamento e vender produtos.',
      },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { key: 'clients.view', label: 'Ver clientes', hint: 'Abrir a carteira de clientes e o histórico de cada um.' },
      { key: 'clients.manage', label: 'Gerenciar clientes', hint: 'Cadastrar e editar clientes.' },
    ],
  },
  {
    label: 'Catálogo e estoque',
    items: [
      { key: 'services.manage', label: 'Gerenciar serviços', hint: 'Criar e editar serviços e pacotes.' },
      { key: 'stock.view', label: 'Ver estoque', hint: 'Abrir a aba de estoque e ver quantidades.' },
      { key: 'stock.manage', label: 'Gerenciar estoque', hint: 'Cadastrar produtos e ajustar quantidades.' },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { key: 'finance.view', label: 'Ver financeiro', hint: 'Caixa, receitas, despesas e faturamento no painel.' },
      { key: 'finance.manage', label: 'Lançar financeiro', hint: 'Registrar despesas e custos fixos.' },
      {
        key: 'finance.payroll',
        label: 'Ver salários e comissões da equipe',
        hint: 'Folha de pagamento e comissão dos colegas. Sem isto, cada um vê só a própria comissão.',
      },
      { key: 'reports.view', label: 'Ver relatórios', hint: 'Relatórios de faturamento, clientes e equipe.' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { key: 'marketing.view', label: 'Ver fidelidade', hint: 'Cartão fidelidade, pontos, cupons e campanhas.' },
      { key: 'marketing.manage', label: 'Gerenciar fidelidade', hint: 'Criar cupons, campanhas e programas.' },
    ],
  },
  {
    label: 'Equipe e sistema',
    items: [
      { key: 'employees.view', label: 'Ver a equipe', hint: 'Abrir a lista de profissionais e as fichas.' },
      { key: 'employees.manage', label: 'Gerenciar a equipe', hint: 'Cadastrar, editar e desativar profissionais.' },
      {
        key: 'settings.manage',
        label: 'Configurações do negócio',
        hint: 'Dados do estabelecimento, expediente e aparência do link público.',
      },
      {
        key: 'admin',
        label: 'Acesso administrativo',
        hint: 'Liga tudo acima de uma vez. Continua sem plano, exclusão da conta e gestão de acessos.',
      },
    ],
  },
]

export interface PermissionPreset {
  key: string
  label: string
  description: string
  permissions: Permission[]
}

/**
 * Ponto de partida, não vínculo: aplicar um preset só preenche os switches. O
 * que fica salvo é sempre a lista de permissões, e o nome exibido é derivado
 * (ver `presetKeyFor`). Mudar um preset numa versão futura não mexe em quem já
 * está salvo.
 */
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

/** Preset cuja lista bate exatamente com a guardada; null = personalizado. */
export function presetKeyFor(stored: string[]): string | null {
  const current = new Set(stored)
  const preset = PERMISSION_PRESETS.find(
    (p) => p.permissions.length === current.size && p.permissions.every((perm) => current.has(perm)),
  )
  return preset?.key ?? null
}

/** Nome do preset para o chip da ficha ("Personalizado" quando não bate nenhum). */
export function presetLabelFor(stored: string[]): string {
  const key = presetKeyFor(stored)
  if (!key) return 'Personalizado'
  return PERMISSION_PRESETS.find((p) => p.key === key)?.label ?? 'Personalizado'
}
