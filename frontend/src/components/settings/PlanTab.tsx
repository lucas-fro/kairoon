import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Crown,
  MessageCircle,
  Palette,
  QrCode,
  Sparkles,
  UserCircle,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getPlan } from '../../api/establishment'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'
import { Skeleton } from '../ui/Skeleton'

const FREE_FEATURES = [
  '1 profissional',
  'Agendamentos ilimitados',
  'Link público de agendamento',
  'Relatórios essenciais',
]

const PRO_BENEFITS: { icon: LucideIcon; label: string }[] = [
  { icon: Users, label: 'Múltiplos profissionais' },
  { icon: MessageCircle, label: 'Lembretes automáticos por WhatsApp' },
  { icon: QrCode, label: 'Sinal de agendamento via Pix' },
  { icon: Palette, label: 'Página de agendamento personalizada' },
]

export function PlanTab() {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const query = useQuery({ queryKey: ['plan'], queryFn: getPlan })

  const planName = query.data?.plan ?? 'free'
  const planLabel = `Plano ${planName.charAt(0).toUpperCase()}${planName.slice(1)}`

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Seu plano</CardTitle>
        <Badge tone="brand">
          <Crown className="h-3 w-3" />
          {planLabel}
        </Badge>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {FREE_FEATURES.map((feature) => (
            <li key={feature} className="flex items-center gap-2 text-sm text-ink-secondary">
              <Check className="h-4 w-4 shrink-0 text-success-dark" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-4 rounded-lg bg-background px-4 py-3">
          {query.isPending && <Skeleton className="h-5 w-48" />}
          {query.isError && (
            <span className="text-sm text-ink-secondary">
              Não foi possível carregar o uso do plano.{' '}
              <button
                type="button"
                onClick={() => query.refetch()}
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                Tentar novamente
              </button>
            </span>
          )}
          {query.data && (
            <span className="flex items-center gap-2 text-sm text-ink-secondary">
              <UserCircle className="h-4 w-4 text-primary" />
              {query.data.limits.employees >= 90
                ? `Profissionais cadastrados: ${query.data.usage.employees}`
                : `Profissionais: ${query.data.usage.employees} de ${query.data.limits.employees}`}
            </span>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={() => setUpgradeOpen(true)}
            leftIcon={<Sparkles className="h-4 w-4" />}
          >
            Fazer upgrade
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Planos pagos em breve"
        description="Estamos preparando o plano Pro com tudo o que o seu negócio precisa para crescer."
      >
        <ul className="space-y-3">
          {PRO_BENEFITS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3 text-sm text-ink-secondary">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </span>
              {label}
            </li>
          ))}
        </ul>
        <DialogActions className="mt-6">
          <Button type="button" variant="outline" onClick={() => setUpgradeOpen(false)}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  )
}
