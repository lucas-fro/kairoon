import { useEffect, useRef, useState } from 'react'
import { Users } from 'lucide-react'
import { cn } from '../../lib/format'
import { EmptyState } from '../ui/EmptyState'
import type { PublicEmployee } from './types'

interface EmployeeStepProps {
  employees: PublicEmployee[]
  onSelect: (employee: PublicEmployee) => void
}

export function EmployeeStep({ employees, onSelect }: EmployeeStepProps) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  function handlePick(employee: PublicEmployee) {
    setPendingId(employee.id)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => onSelect(employee), 150)
  }

  if (employees.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum profissional disponível"
        description="Este estabelecimento ainda não cadastrou profissionais."
      />
    )
  }

  return (
    <div className="space-y-3">
      {employees.map((employee) => (
        <button
          key={employee.id}
          type="button"
          onClick={() => handlePick(employee)}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl bg-surface p-4 text-left shadow-card transition-shadow duration-200',
            pendingId === employee.id ? 'ring-2 ring-secondary' : 'hover:shadow-soft',
          )}
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-light text-base font-semibold text-primary">
            {employee.name.charAt(0).toUpperCase()}
          </div>
          <p className="min-w-0 truncate text-sm font-medium text-ink">{employee.name}</p>
        </button>
      ))}
    </div>
  )
}
