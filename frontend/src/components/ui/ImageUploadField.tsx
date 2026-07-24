import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { ApiError } from '../../api/client'
import { cn } from '../../lib/format'
import { downscaleImageForUpload } from '../../lib/imageResize'
import { Button } from './Button'
import { useToast } from './Toast'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Teto do que sobe pro backend (bate com o limite do servidor). */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
/**
 * Teto do arquivo ORIGINAL escolhido (antes do resize no cliente). Serve só para
 * não decodificar um arquivo absurdo num celular fraco; fotos normais passam bem
 * abaixo disso e são encolhidas antes de subir.
 */
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024

interface ImageUploadFieldProps {
  label: string
  hint?: string
  /** URL da imagem atual (ou null para o placeholder). */
  value: string | null
  /** Texto alternativo / contexto (nome do estabelecimento ou profissional). */
  name: string
  /** Formato da prévia: círculo (logo/foto) ou faixa (banner). */
  variant?: 'circle' | 'banner'
  disabled?: boolean
  /** Envia o arquivo escolhido. O chamador faz o upload e persiste a URL. */
  onUpload: (file: File) => Promise<void>
  /** Remove a imagem atual (opcional). */
  onRemove?: () => Promise<void> | void
}

/**
 * Campo de upload de imagem com prévia, validação no cliente (tipo + tamanho) e
 * estado de carregamento. O upload em si (Bunny CDN) e a persistência ficam a
 * cargo do `onUpload` do chamador.
 */
export function ImageUploadField({
  label,
  hint,
  value,
  name,
  variant = 'circle',
  disabled,
  onUpload,
  onRemove,
}: ImageUploadFieldProps) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Zera o valor para permitir reescolher o mesmo arquivo depois.
    event.target.value = ''
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Envie uma imagem PNG, JPG ou WEBP.')
      return
    }
    if (file.size > MAX_ORIGINAL_BYTES) {
      toast.error('Imagem muito grande. Escolha uma até 30 MB.')
      return
    }
    setBusy(true)
    try {
      // Encolhe no navegador antes de enviar (menos dado trafegado). Best-effort:
      // se o navegador não suportar, segue com o original e o backend redimensiona.
      const prepared = await downscaleImageForUpload(file)
      if (prepared.size > MAX_UPLOAD_BYTES) {
        toast.error('Imagem muito grande. Tente uma com menos resolução (máximo 5 MB).')
        return
      }
      await onUpload(prepared)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível enviar a imagem.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!onRemove) return
    setBusy(true)
    try {
      await onRemove()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover a imagem.')
    } finally {
      setBusy(false)
    }
  }

  const previewClass =
    variant === 'banner' ? 'h-16 w-28 rounded-lg' : 'h-16 w-16 rounded-full'

  return (
    <div>
      <p className="mb-2 block text-[13px] font-medium text-ink-secondary">{label}</p>
      <div className="flex items-center gap-4">
        <div
          className={cn(
            'flex shrink-0 items-center justify-center overflow-hidden border border-line bg-background text-ink-tertiary',
            previewClass,
          )}
        >
          {value ? (
            <img src={value} alt={name} className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5" strokeWidth={1.8} />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFile}
            disabled={disabled || busy}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              isLoading={busy}
              leftIcon={busy ? undefined : <Upload className="h-4 w-4" />}
              onClick={() => inputRef.current?.click()}
            >
              {value ? 'Trocar imagem' : 'Enviar imagem'}
            </Button>
            {value && onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || busy}
                onClick={handleRemove}
                leftIcon={<Trash2 className="h-4 w-4" />}
              >
                Remover
              </Button>
            )}
          </div>
          {hint && <p className="text-xs text-ink-tertiary">{hint}</p>}
        </div>
      </div>
    </div>
  )
}
