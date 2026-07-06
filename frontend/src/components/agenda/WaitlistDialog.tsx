import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Plus, Trash2, UserCheck } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createWaitlistEntry, deleteWaitlistEntry, listWaitlist } from '../../api/waitlist'
import { ClientPicker, type SelectedClient } from '../clients/ClientPicker'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { useToast } from '../ui/Toast'
import { todayStr } from '../../lib/dates'
import { formatBRL, formatDate, formatDuration, formatPhone } from '../../lib/format'
import type { Employee, Service, WaitlistEntry } from '../../types/api'

interface WaitlistDialogProps {
  open: boolean
  onClose: () => void
  services: Service[]
  employees: Employee[]
  onPromote: (entry: WaitlistEntry) => void
}

export function WaitlistDialog({
  open,
  onClose,
  services,
  employees,
  onPromote,
}: WaitlistDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeServices = services.filter((s) => s.active)
  const activeEmployees = employees.filter((e) => e.active)

  const [showAdd, setShowAdd] = useState(false)
  const [client, setClient] = useState<SelectedClient | null>(null)
  const [serviceId, setServiceId] = useState('')
  const [preferredEmployeeId, setPreferredEmployeeId] = useState('')
  const [targetDate, setTargetDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const waitlistQuery = useQuery({
    queryKey: ['waitlist'],
    queryFn: () => listWaitlist({ status: 'waiting' }),
    enabled: open,
  })

  function resetAddForm() {
    setShowAdd(false)
    setClient(null)
    setServiceId('')
    setPreferredEmployeeId('')
    setTargetDate(todayStr())
    setNote('')
  }

  const addMutation = useMutation({
    mutationFn: createWaitlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      toast.success('Adicionado à fila de espera')
      resetAddForm()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao adicionar à fila')
    },
  })

  const removeMutation = useMutation({
    mutationFn: deleteWaitlistEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['waitlist'] })
      setConfirmingId(null)
      toast.success('Removido da fila')
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao remover')
    },
  })

  function handleAdd() {
    if (!client || !serviceId) return
    addMutation.mutate({
      clientId: client.id,
      serviceId,
      preferredEmployeeId: preferredEmployeeId || undefined,
      targetDate,
      note: note.trim() || undefined,
    })
  }

  const entries = waitlistQuery.data ?? []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Fila de espera"
      description="Enfileire clientes quando o dia estiver cheio e encaixe quando abrir vaga."
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Adicionar à fila */}
        {showAdd ? (
          <div className="space-y-3 rounded-lg border border-line bg-background p-3">
            <p className="text-[13px] font-medium text-ink-secondary">Novo na fila</p>
            <ClientPicker value={client} onChange={setClient} disabled={addMutation.isPending} />
            <Select
              label="Serviço"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              <option value="">Selecione o serviço</option>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatDuration(s.durationMinutes)} · {formatBRL(s.priceCents)}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeEmployees.length > 1 && (
                <Select
                  label="Profissional (opcional)"
                  value={preferredEmployeeId}
                  onChange={(e) => setPreferredEmployeeId(e.target.value)}
                >
                  <option value="">Qualquer profissional</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </Select>
              )}
              <Input
                label="Dia desejado"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <Input
              label="Observação (opcional)"
              placeholder="Ex.: após 15h, qualquer horário…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={resetAddForm}
                disabled={addMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleAdd}
                disabled={!client || !serviceId}
                isLoading={addMutation.isPending}
              >
                Adicionar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowAdd(true)}
          >
            Adicionar à fila
          </Button>
        )}

        {/* Lista */}
        {waitlistQuery.isPending ? (
          <p className="py-6 text-center text-sm text-ink-tertiary">Carregando…</p>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CalendarClock className="h-8 w-8 text-ink-tertiary" />
            <p className="text-sm text-ink-secondary">Ninguém na fila de espera.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{entry.client.name}</p>
                    <p className="truncate text-xs text-ink-tertiary">
                      {formatPhone(entry.client.phone)} · {entry.service.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-secondary">
                      {formatDate(entry.targetDate)} ·{' '}
                      {entry.preferredEmployee?.name ?? 'Qualquer profissional'}
                    </p>
                    {entry.note && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">Obs.: {entry.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <Button
                      size="sm"
                      leftIcon={<UserCheck className="h-4 w-4" />}
                      onClick={() => onPromote(entry)}
                    >
                      Encaixar
                    </Button>
                  </div>
                </div>

                {confirmingId === entry.id ? (
                  <div className="mt-2 flex items-center justify-end gap-2 border-t border-line-divider pt-2">
                    <span className="mr-auto text-xs text-ink-secondary">Remover da fila?</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmingId(null)}
                      disabled={removeMutation.isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeMutation.mutate(entry.id)}
                      isLoading={removeMutation.isPending}
                    >
                      Remover
                    </Button>
                  </div>
                ) : (
                  <div className="mt-2 flex justify-end border-t border-line-divider pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-2 text-error-dark hover:bg-error-light hover:text-error-dark"
                      onClick={() => setConfirmingId(entry.id)}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                    >
                      Remover
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  )
}
