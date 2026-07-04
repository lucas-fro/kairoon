import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { createAppointment, listAppointments } from '../../api/appointments'
import { ApiError } from '../../api/client'
import { createClient, listClients } from '../../api/clients'
import { useToast } from '../ui/Toast'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { SelectMenu } from '../ui/SelectMenu'
import { timeToMinutes, todayStr } from '../../lib/dates'
import { formatBRL, formatDuration, formatPhone, isValidPhone, onlyDigits } from '../../lib/format'
import type { Employee, Service } from '../../types/api'
import { buildTimeOptions } from './timeOptions'

interface NewAppointmentDialogProps {
  open: boolean
  onClose: () => void
  services: Service[]
  employees: Employee[]
  startMinutes: number
  endMinutes: number
  defaultDate?: string
  defaultTime?: string
}

interface SelectedClient {
  id: string
  name: string
  phone: string
}

export function NewAppointmentDialog({
  open,
  onClose,
  services,
  employees,
  startMinutes,
  endMinutes,
  defaultDate,
  defaultTime,
}: NewAppointmentDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const activeServices = services.filter((s) => s.active)
  const activeEmployees = employees.filter((e) => e.active)
  const timeOptions = useMemo(
    () => buildTimeOptions(startMinutes, endMinutes),
    [startMinutes, endMinutes],
  )

  const [search, setSearch] = useState('')
  const [selectedClient, setSelectedClient] = useState<SelectedClient | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')
  const [newGender, setNewGender] = useState('')
  const [newError, setNewError] = useState<string | undefined>()

  const [serviceId, setServiceId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [date, setDate] = useState(defaultDate ?? todayStr())
  const [startTime, setStartTime] = useState(defaultTime ?? timeOptions[0] ?? '09:00')

  useEffect(() => {
    if (!open) return
    setDate(defaultDate ?? todayStr())
    setStartTime(defaultTime ?? timeOptions[0] ?? '09:00')
    setServiceId(activeServices[0]?.id ?? '')
    setEmployeeId(activeEmployees[0]?.id ?? '')
    setSearch('')
    setSelectedClient(null)
    setAddingNew(false)
    setNewName('')
    setNewPhone('')
    setNewError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDate, defaultTime])

  // Preenche os selects quando as queries resolverem com o dialog já aberto
  useEffect(() => {
    if (!open) return
    if (!serviceId && activeServices[0]) setServiceId(activeServices[0].id)
    if (!employeeId && activeEmployees[0]) setEmployeeId(activeEmployees[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, services, employees])

  const clientsQuery = useQuery({
    queryKey: ['clients', ''],
    queryFn: () => listClients(),
    enabled: open,
  })

  // Agendamentos do profissional no dia, para marcar horários ocupados
  const dayAppointmentsQuery = useQuery({
    queryKey: ['appointments', 'slots', date, employeeId],
    queryFn: () => listAppointments({ start: date, end: date, employeeId }),
    enabled: open && Boolean(date && employeeId),
  })

  const occupiedTimes = useMemo(() => {
    const set = new Set<string>()
    const duration = services.find((s) => s.id === serviceId)?.durationMinutes ?? 0
    if (!duration) return set
    const busy = (dayAppointmentsQuery.data ?? [])
      .filter((a) => a.status !== 'cancelled')
      .map((a) => ({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) }))
    for (const time of timeOptions) {
      const start = timeToMinutes(time)
      const end = start + duration
      if (busy.some((b) => start < b.end && end > b.start)) set.add(time)
    }
    return set
  }, [dayAppointmentsQuery.data, services, serviceId, timeOptions])

  // Filtragem em tempo real por nome ou telefone
  const filteredClients = useMemo(() => {
    const all = clientsQuery.data ?? []
    const term = search.trim().toLowerCase()
    const digits = onlyDigits(search)
    if (!term) return all.slice(0, 8)
    return all
      .filter(
        (c) =>
          c.name.toLowerCase().includes(term) ||
          (digits.length > 0 && onlyDigits(c.phone).includes(digits)),
      )
      .slice(0, 8)
  }, [search, clientsQuery.data])

  const createClientMutation = useMutation({
    mutationFn: createClient,
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      setSelectedClient({ id: client.id, name: client.name, phone: client.phone })
      setAddingNew(false)
      setNewName('')
      setNewPhone('')
      setNewEmail('')
      setNewBirthDate('')
      setNewGender('')
      setNewError(undefined)
      setSearch('')
    },
    onError: (err) => {
      setNewError(err instanceof ApiError ? err.message : 'Erro ao salvar cliente')
    },
  })

  const createMutation = useMutation({
    mutationFn: createAppointment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      toast.success('Agendamento criado com sucesso')
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado ao criar agendamento')
    },
  })

  const formValid =
    Boolean(serviceId && employeeId && date && startTime && selectedClient) &&
    !occupiedTimes.has(startTime)

  function handleSaveNewClient() {
    const name = newName.trim()
    if (name.length < 2) {
      setNewError('Informe o nome do cliente')
      return
    }
    if (!isValidPhone(newPhone)) {
      setNewError('Telefone inválido')
      return
    }
    setNewError(undefined)
    createClientMutation.mutate({
      name,
      phone: onlyDigits(newPhone),
      email: newEmail.trim(),
      birthDate: newBirthDate,
      gender: newGender,
    })
  }

  function cancelNewClient() {
    setAddingNew(false)
    setNewName('')
    setNewPhone('')
    setNewEmail('')
    setNewBirthDate('')
    setNewGender('')
    setNewError(undefined)
  }

  function handleSubmit() {
    if (!formValid || !selectedClient) return
    createMutation.mutate({ serviceId, employeeId, date, startTime, clientId: selectedClient.id })
  }

  return (
    <Dialog open={open} onClose={onClose} title="Novo agendamento" maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Cliente */}
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-secondary">Cliente</p>

          {selectedClient ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-background px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{selectedClient.name}</p>
                <p className="text-xs text-ink-tertiary">{formatPhone(selectedClient.phone)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedClient(null)}
                className="shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-surface hover:text-ink-secondary"
                aria-label="Trocar cliente"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Buscar por nome ou telefone…"
                  leftIcon={<Search className="h-4 w-4" />}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={addingNew}
                />
                <Button
                  type="button"
                  variant={addingNew ? 'secondary' : 'outline'}
                  className="shrink-0 px-3"
                  onClick={() => {
                    setAddingNew((v) => !v)
                    setNewError(undefined)
                  }}
                  aria-label="Adicionar novo cliente"
                  title="Novo cliente"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>

              {/* Lista de clientes filtrada em tempo real */}
              {!addingNew && (
                <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line-divider">
                  {clientsQuery.isPending ? (
                    <p className="px-3 py-3 text-sm text-ink-tertiary">Carregando clientes…</p>
                  ) : filteredClients.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-ink-tertiary">
                      Nenhum cliente encontrado. Use o botão + para cadastrar.
                    </p>
                  ) : (
                    filteredClients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => {
                          setSelectedClient({
                            id: client.id,
                            name: client.name,
                            phone: client.phone,
                          })
                          setSearch('')
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-line-divider px-3 py-2.5 text-left transition-colors duration-150 last:border-0 hover:bg-surface-hover"
                      >
                        <span className="truncate text-sm font-medium text-ink">{client.name}</span>
                        <span className="shrink-0 text-xs text-ink-tertiary">
                          {formatPhone(client.phone)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Formulário de novo cliente (expande ao clicar no ícone +) */}
              {addingNew && (
                <div className="mt-2 space-y-3 rounded-lg border border-line bg-background p-3">
                  <Input
                    label="Nome do cliente"
                    placeholder="Nome completo"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                  <Input
                    label="Telefone / WhatsApp"
                    placeholder="(11) 98765-4321"
                    inputMode="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                  />
                  <Input
                    label="E-mail (opcional)"
                    type="email"
                    placeholder="nome@email.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Nascimento (opcional)"
                      type="date"
                      value={newBirthDate}
                      onChange={(e) => setNewBirthDate(e.target.value)}
                    />
                    <Select
                      label="Sexo (opcional)"
                      value={newGender}
                      onChange={(e) => setNewGender(e.target.value)}
                    >
                      <option value="">Não informar</option>
                      <option value="masculino">Masculino</option>
                      <option value="feminino">Feminino</option>
                      <option value="outro">Outro</option>
                    </Select>
                  </div>
                  {newError && <p className="text-xs text-error-dark">{newError}</p>}
                  <DialogActions>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={cancelNewClient}
                      disabled={createClientMutation.isPending}
                    >
                      Cancelar adição
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveNewClient}
                      isLoading={createClientMutation.isPending}
                    >
                      Salvar
                    </Button>
                  </DialogActions>
                </div>
              )}
            </>
          )}
        </div>

        <Select label="Serviço" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          <option value="">Selecione o serviço</option>
          {activeServices.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · {formatDuration(service.durationMinutes)} ·{' '}
              {formatBRL(service.priceCents)}
            </option>
          ))}
        </Select>

        {activeEmployees.length > 1 && (
          <Select
            label="Profissional"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            {activeEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        )}

        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />

        <div>
          <SelectMenu
            label="Horário"
            value={startTime}
            onChange={setStartTime}
            placeholder="Selecione o horário"
            options={timeOptions.map((time) => ({
              value: time,
              label: occupiedTimes.has(time) ? `${time} · ocupado` : time,
              disabled: occupiedTimes.has(time),
            }))}
          />
          {dayAppointmentsQuery.isFetching && (
            <p className="mt-2 text-xs text-ink-tertiary">Verificando horários ocupados…</p>
          )}
        </div>

        <DialogActions className="pt-2">
          <Button variant="outline" onClick={onClose} disabled={createMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!formValid} isLoading={createMutation.isPending}>
            Criar agendamento
          </Button>
        </DialogActions>
      </div>
    </Dialog>
  )
}
