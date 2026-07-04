import { CalendarX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary-light">
        <CalendarX className="h-7 w-7 text-primary" />
      </div>
      <h1 className="font-display text-2xl font-semibold text-ink">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-ink-secondary">
        O endereço que você acessou não existe ou o link de agendamento está incorreto.
      </p>
      <Link to="/login">
        <Button variant="outline">Ir para o login</Button>
      </Link>
    </div>
  )
}
