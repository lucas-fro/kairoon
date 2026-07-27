import { useEffect, useState } from 'react'
import { Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { DialogActions } from '../ui/DialogActions'

/**
 * Escuta o evento `trial:expired` (disparado por api/client quando o backend
 * bloqueia uma escrita com 402 TRIAL_EXPIRED) e abre um convite de upgrade,
 * assim qualquer ação bloqueada dá um retorno claro, sem deslogar o usuário.
 *
 * Para a equipe o texto muda: quem não é dono não tem como assinar, então
 * oferecer "ver planos" seria mandá-la para uma tela que ela nem enxerga.
 */
export function TrialExpiredListener() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { isOwner } = useAuth()

  useEffect(() => {
    const handler = () => setOpen(true)
    window.addEventListener('trial:expired', handler)
    return () => window.removeEventListener('trial:expired', handler)
  }, [])

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={isOwner ? 'Seu teste grátis acabou' : 'Edição bloqueada'}
      description={
        isOwner
          ? 'Sua conta está em modo somente-leitura. Assine um plano para voltar a criar e editar.'
          : 'O plano deste estabelecimento está em modo somente-leitura. Fale com o responsável para liberar as edições.'
      }
      maxWidth="max-w-md"
    >
      <div className="flex items-center gap-2.5 rounded-lg bg-secondary-light px-4 py-3 text-sm text-ink-secondary">
        <Lock className="h-4 w-4 shrink-0 text-primary" />
        Os dados continuam salvos e visíveis: só a edição fica bloqueada.
      </div>
      <DialogActions className="mt-6">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {isOwner ? 'Agora não' : 'Entendi'}
        </Button>
        {isOwner && (
          <Button
            type="button"
            onClick={() => {
              setOpen(false)
              navigate('/app/configuracoes?tab=plano')
            }}
          >
            Ver planos
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
