import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { KeyRound, Mail, ShieldCheck, ShieldOff } from 'lucide-react'
import { revokeAccess, revokeInvite, sendInvite } from '../../api/access'
import { ApiError } from '../../api/client'
import { useAuth } from '../../contexts/AuthContext'
import { presetLabelFor } from '../../lib/permissions'
import type { Employee } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { useToast } from '../ui/Toast'

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/** Dias inteiros até o vencimento do convite (mínimo 0). */
function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

/**
 * Coluna "Acesso" da lista de profissionais: mostra a situação do login e as
 * ações de convite. Só o dono enxerga os botões, porque gerenciar acesso é o
 * único poder que nem o switch administrativo concede.
 */
export function EmployeeAccessCell({
  employee,
  onManagePermissions,
  onChanged,
}: {
  employee: Employee
  onManagePermissions: (employee: Employee) => void
  onChanged: () => void
}) {
  const { isOwner } = useAuth()
  const toast = useToast()
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)

  const inviteMutation = useMutation({
    mutationFn: () => sendInvite(employee.id),
    onSuccess: () => {
      toast.success(`Convite enviado para ${employee.email}`)
      onChanged()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const cancelInviteMutation = useMutation({
    mutationFn: () => revokeInvite(employee.id),
    onSuccess: () => {
      toast.success('Convite cancelado')
      onChanged()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const revokeMutation = useMutation({
    mutationFn: () => revokeAccess(employee.id),
    onSuccess: () => {
      toast.success(`${employee.name} não acessa mais o painel`)
      setConfirmingRevoke(false)
      onChanged()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  // O dono é a origem das permissões: não tem convite nem switches.
  if (employee.isOwner) {
    return <span className="text-[13px] text-ink-tertiary">Acesso total</span>
  }

  const status = employee.accessStatus

  return (
    <div className="flex flex-col items-start gap-1.5">
      {status === 'active' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success">Com acesso</Badge>
          <span className="text-[11px] text-ink-tertiary">
            {presetLabelFor(employee.permissions)}
          </span>
        </div>
      )}
      {status === 'invited' && (
        <Badge tone="warning">
          Convite enviado
          {employee.inviteExpiresAt ? ` (${daysUntil(employee.inviteExpiresAt)}d)` : ''}
        </Badge>
      )}
      {status === 'expired' && <Badge tone="neutral">Convite expirado</Badge>}
      {status === 'none' && <Badge tone="neutral">Sem acesso</Badge>}

      {isOwner && (
        <div className="flex flex-wrap items-center gap-1">
          {status === 'active' ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onManagePermissions(employee)}
                leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
              >
                Permissões
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingRevoke(true)}
                className="text-error-dark hover:bg-error-light hover:text-error-dark"
                leftIcon={<ShieldOff className="h-3.5 w-3.5" />}
              >
                Revogar
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => inviteMutation.mutate()}
                isLoading={inviteMutation.isPending}
                leftIcon={
                  status === 'none' ? (
                    <Mail className="h-3.5 w-3.5" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5" />
                  )
                }
              >
                {status === 'none' ? 'Convidar' : 'Reenviar'}
              </Button>
              {/* Permissões antes do aceite: o convite já entra valendo com o
                  que o dono configurou aqui. */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onManagePermissions(employee)}
                leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
              >
                Permissões
              </Button>
              {status === 'invited' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelInviteMutation.mutate()}
                  isLoading={cancelInviteMutation.isPending}
                  className="text-error-dark hover:bg-error-light hover:text-error-dark"
                >
                  Cancelar
                </Button>
              )}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmingRevoke}
        onClose={() => setConfirmingRevoke(false)}
        onConfirm={() => revokeMutation.mutate()}
        title="Revogar o acesso ao painel?"
        description={`${employee.name} deixa de entrar no painel imediatamente. A ficha, a agenda e todo o histórico continuam intactos, e você pode convidar de novo quando quiser.`}
        confirmLabel="Revogar acesso"
        danger
        isLoading={revokeMutation.isPending}
      />
    </div>
  )
}
