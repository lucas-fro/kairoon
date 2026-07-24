import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'

/**
 * Escuta o evento `trial:expired` (disparado por api/client quando o backend
 * bloqueia uma escrita com 402 TRIAL_EXPIRED) e abre um convite de upgrade,
 * assim qualquer ação bloqueada dá um retorno claro, sem deslogar o usuário.
 */
export function TrialExpiredListener() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('trial:expired', handler)
    return () => window.removeEventListener('trial:expired', handler)
  }, [])

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title="Seu teste grátis acabou"
      description="Sua conta está em modo somente-leitura. Assine um plano para voltar a criar e editar."
      maxWidth="max-w-md"
    >
      <div className="flex items-center gap-2.5 rounded-lg bg-secondary-light px-4 py-3 text-sm text-ink-secondary">
        <Lock className="h-4 w-4 shrink-0 text-primary" />
        Seus dados continuam salvos e visíveis: só a edição fica bloqueada até assinar.
      </div>
      <DialogActions className="mt-6">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Agora não
        </Button>
        <Button
          type="button"
          onClick={() => {
            setOpen(false)
            navigate('/app/configuracoes?tab=plano')
          }}
        >
          Ver planos
        </Button>
      </DialogActions>
    </Dialog>
  )
}
