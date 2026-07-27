import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UserPlus, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createClient, listClients } from '../../api/clients'
import { useAuth } from '../../contexts/AuthContext'
import { dateBRToIso, formatPhone, isValidPhone, maskDateBR, onlyDigits } from '../../lib/format'
import { Button } from '../ui/Button'
import { DialogActions } from '../ui/DialogActions'
import { Input } from '../ui/Input'
import { SelectMenu } from '../ui/SelectMenu'
import type { SelectMenuOption } from '../ui/SelectMenu'

const GENDER_OPTIONS: SelectMenuOption[] = [
  { value: '', label: 'Não informar' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'feminino', label: 'Feminino' },
  { value: 'outro', label: 'Outro' },
]

export interface SelectedClient {
  id: string
  name: string
  phone: string
}

interface ClientPickerProps {
  value: SelectedClient | null
  onChange: (client: SelectedClient | null) => void
  autoFocus?: boolean
  /** Ex.: enquanto um submit está pendente. */
  disabled?: boolean
}

/**
 * Seletor de cliente reutilizável: busca em tempo real na base + cadastro
 * inline de novo cliente. O pai só possui o cliente selecionado
 * (value/onChange); todo o resto (busca, form de novo cliente, queries) é
 * interno. Como o Dialog desmonta os filhos ao fechar, o estado se auto-reseta
 * a cada abertura.
 */
export function ClientPicker({ value, onChange, autoFocus, disabled }: ClientPickerProps) {
  const queryClient = useQueryClient()
  const { can } = useAuth()

  // Quem tem clients.view recebe a carteira inteira; quem só tem clients.lookup
  // (profissional que agenda, mas não abre a aba Clientes) precisa mandar um
  // termo de 2+ caracteres, senão a rota devolve 400.
  const canListAll = can('clients.view')

  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newBirthDate, setNewBirthDate] = useState('')
  const [newGender, setNewGender] = useState('')
  const [newError, setNewError] = useState<string | undefined>()

  // Debounce de 300ms para não disparar uma request por tecla digitada
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Abaixo de 2 caracteres não vale mandar termo: para quem lista tudo o vazio
  // devolve a carteira inteira (e reaproveita o cache ['clients', '']), e para
  // quem só faz lookup a query fica desligada até dar o tamanho mínimo.
  const serverTerm = debouncedSearch.length >= 2 ? debouncedSearch : ''

  const clientsQuery = useQuery({
    queryKey: ['clients', serverTerm],
    queryFn: () => listClients(serverTerm || undefined),
    enabled: serverTerm.length >= 2 || canListAll,
    // Cada termo é um cache novo e vazio: sem isto a lista sumiria atrás de
    // "Carregando clientes…" a cada tecla. Mesmo padrão da busca da ClientsPage.
    placeholderData: (prev) => prev,
  })

  // Filtragem em tempo real por nome ou telefone. O resultado fresco do servidor
  // já vem filtrado (e truncado), então refiltrar por cima esconderia acerto que
  // o backend achou; só o que ainda é sobra do termo anterior (placeholder) e a
  // listagem completa passam pelo filtro local.
  const filteredClients = useMemo(() => {
    const all = clientsQuery.data ?? []
    if (serverTerm && !clientsQuery.isPlaceholderData) return all.slice(0, 8)
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
  }, [search, serverTerm, clientsQuery.data, clientsQuery.isPlaceholderData])

  const createClientMutation = useMutation({
    mutationFn: createClient,
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onChange({ id: client.id, name: client.name, phone: client.phone })
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
      birthDate: dateBRToIso(newBirthDate),
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

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-background px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{value.name}</p>
          <p className="text-xs text-ink-tertiary">{formatPhone(value.phone)}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="shrink-0 rounded-lg p-1.5 text-ink-tertiary transition-colors hover:bg-surface hover:text-ink-secondary disabled:opacity-50"
          aria-label="Trocar cliente"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por nome ou telefone…"
          leftIcon={<Search className="h-4 w-4 text-primary" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={addingNew || disabled}
          autoFocus={autoFocus}
        />
        <Button
          type="button"
          variant={addingNew ? 'secondary' : 'outline'}
          className="shrink-0 px-3"
          disabled={disabled}
          onClick={() => {
            setAddingNew((v) => !v)
            setNewError(undefined)
          }}
          aria-label="Adicionar novo cliente"
          title="Novo cliente"
        >
          <UserPlus className="h-4 w-4 text-primary" />
        </Button>
      </div>

      {/* Lista de clientes filtrada em tempo real */}
      {!addingNew && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-line-divider">
          {!canListAll && search.trim().length < 2 ? (
            // Sem clients.view a query fica desligada, e query desligada segue
            // 'pending' para sempre: pedir o termo evita um "carregando" eterno.
            <p className="px-3 py-3 text-sm text-ink-tertiary">
              Digite 2 letras ou mais para buscar o cliente.
            </p>
          ) : clientsQuery.isPending ? (
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
                  onChange({ id: client.id, name: client.name, phone: client.phone })
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
              inputMode="numeric"
              placeholder="DD/MM/AAAA"
              value={newBirthDate}
              onChange={(e) => setNewBirthDate(maskDateBR(e.target.value))}
            />
            <SelectMenu
              label="Sexo (opcional)"
              value={newGender}
              onChange={setNewGender}
              options={GENDER_OPTIONS}
            />
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
  )
}
