import { useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { updatePermissions } from '../../api/access'
import { ApiError } from '../../api/client'
import { cn } from '../../lib/format'
import {
  PERMISSION_GROUPS,
  PERMISSION_PRESETS,
  presetKeyFor,
  type Permission,
} from '../../lib/permissions'
import type { Employee } from '../../types/api'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Switch } from '../ui/Switch'

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Erro inesperado'
}

/**
 * Permissões de um profissional.
 *
 * Os presets no topo são ponto de partida: clicar preenche os interruptores de
 * uma vez, e mexer em qualquer um deles vira "Personalizado" sem desfazer nada.
 * O que vai para o servidor é sempre a lista de permissões, nunca o nome do
 * preset, e o rótulo exibido é derivado de volta a partir da lista.
 */
export function PermissionsDialog({
  employee,
  open,
  onClose,
  onSaved,
}: {
  employee: Employee | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  // Reabrir com outra ficha precisa recarregar o estado do zero.
  useEffect(() => {
    if (open && employee) {
      setSelected(new Set(employee.permissions))
      setError(null)
    }
  }, [open, employee])

  const isAdmin = selected.has('admin')
  const currentPreset = useMemo(() => presetKeyFor([...selected]), [selected])

  const saveMutation = useMutation({
    mutationFn: () => updatePermissions(employee?.id ?? '', [...selected]),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  function toggle(permission: Permission) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(permission)) next.delete(permission)
      else next.add(permission)
      return next
    })
  }

  function applyPreset(permissions: Permission[]) {
    setSelected(new Set(permissions))
    setError(null)
  }

  if (!employee) return null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Permissões de ${employee.name}`}
      description="Escolha um perfil pronto e ajuste o que quiser. Vale a partir do próximo acesso."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Perfis prontos
          </p>
          <div className="flex flex-wrap gap-2">
            {PERMISSION_PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => applyPreset(preset.permissions)}
                title={preset.description}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  currentPreset === preset.key
                    ? 'border-primary bg-primary text-white'
                    : 'border-line bg-surface text-ink-secondary hover:border-primary/40 hover:text-ink',
                )}
              >
                {preset.label}
              </button>
            ))}
            {!currentPreset && (
              <span className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm text-ink-muted">
                Personalizado
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            {PERMISSION_PRESETS.find((p) => p.key === currentPreset)?.description ??
              'Combinação própria de permissões.'}
          </p>
        </div>

        <div className="max-h-[45vh] space-y-5 overflow-y-auto pr-1">
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  // Com o administrativo ligado, o resto está incluso: os
                  // interruptores aparecem marcados e travados, para ficar claro
                  // que é consequência e não um estado que se perdeu.
                  const forcedByAdmin = isAdmin && item.key !== 'admin'
                  const checked = forcedByAdmin || selected.has(item.key)
                  return (
                    <div
                      key={item.key}
                      className="flex items-start justify-between gap-4 rounded-lg px-2 py-2 hover:bg-background"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{item.label}</p>
                        <p className="text-xs leading-snug text-ink-secondary">{item.hint}</p>
                      </div>
                      <Switch
                        checked={checked}
                        disabled={forcedByAdmin}
                        onChange={() => toggle(item.key)}
                        aria-label={item.label}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-background p-3 text-xs text-ink-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          Plano e assinatura, exclusão da conta e a gestão destes acessos continuam
          exclusivos do dono, mesmo com o acesso administrativo ligado.
        </p>

        {error && (
          <p className="flex items-start gap-2 rounded-lg bg-error/10 p-3 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogActions>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => saveMutation.mutate()} isLoading={saveMutation.isPending}>
            Salvar permissões
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
