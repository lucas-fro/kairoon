import type { WorkingHour } from '../../types/api'
import { MiniCalendar } from './MiniCalendar'

interface DateStepProps {
  selected: string | null
  workingHours: WorkingHour[]
  onSelect: (date: string) => void
}

export function DateStep({ selected, workingHours, onSelect }: DateStepProps) {
  return (
    <div className="space-y-4">
      <MiniCalendar selected={selected} workingHours={workingHours} onSelect={onSelect} />
      <p className="text-center text-xs text-ink-tertiary">
        Toque em um dia disponível para ver os horários
      </p>
    </div>
  )
}
