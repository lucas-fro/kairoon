import { Lock } from 'lucide-react'
import type { Establishment } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'

interface AppearanceTabProps {
  establishment: Establishment
}

export function AppearanceTab({ establishment }: AppearanceTabProps) {
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Aparência</CardTitle>
        <Badge tone="brand">
          <Lock className="h-3 w-3" />
          Disponível no plano Pro
        </Badge>
      </CardHeader>
      <CardContent>
        <span className="mb-2 block text-[13px] font-medium text-ink-secondary">Cor do tema</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={establishment.themeColor}
            disabled
            className="h-10 w-14 cursor-not-allowed rounded-lg border border-line bg-surface p-1 opacity-40"
            aria-label="Cor do tema (disponível no plano Pro)"
          />
          <span
            className="h-6 w-6 rounded-full border border-line"
            style={{ backgroundColor: establishment.themeColor }}
            aria-hidden="true"
          />
          <span className="text-sm text-ink-tertiary">{establishment.themeColor}</span>
        </div>
        <p className="mt-3 text-xs text-ink-tertiary">
          Personalize a cor da sua página pública de agendamento fazendo upgrade para o plano Pro.
        </p>
      </CardContent>
    </Card>
  )
}
