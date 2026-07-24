import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'
import { ApiError } from '../../api/client'
import { cn } from '../../lib/format'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { ImageCropper } from './ImageCropper'
import type { ImageCropperHandle } from './ImageCropper'
import { useToast } from './Toast'

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Teto do arquivo ORIGINAL escolhido (antes do recorte): evita decodificar um
 *  arquivo absurdo num celular fraco. A saída do recorte já é um WebP pequeno. */
const MAX_ORIGINAL_BYTES = 30 * 1024 * 1024

/** Parâmetros de recorte por formato. */
const SHAPE_CONFIG = {
  circle: { aspect: 1, outputWidth: 512, outputHeight: 512 },
  banner: { aspect: 16 / 9, outputWidth: 1600, outputHeight: 900 },
} as const

interface ImageEditDialogProps {
  open: boolean
  onClose: () => void
  /** Título do pop-up. */
  label: string
  hint?: string
  /** URL da imagem atual (ou null para o placeholder). */
  value: string | null
  /** Texto alternativo / contexto (nome do estabelecimento). */
  name: string
  /** Círculo (logo) ou faixa (banner) — define máscara, proporção e resolução. */
  shape: 'circle' | 'banner'
  /** Recebe o arquivo JÁ recortado; faz o upload e persiste a URL. */
  onSave: (file: File) => Promise<void>
  /** Remove a imagem atual (opcional). */
  onRemove?: () => Promise<void> | void
}

/**
 * Pop-up de edição de imagem estilo rede social: troca/remove a imagem e, ao
 * escolher uma nova, reposiciona e dá zoom antes de salvar. Controlado por `open`.
 * O recorte sai como WebP; o upload e a persistência ficam a cargo do `onSave`.
 */
export function ImageEditDialog({
  open,
  onClose,
  label,
  hint,
  value,
  name,
  shape,
  onSave,
  onRemove,
}: ImageEditDialogProps) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const cropperRef = useRef<ImageCropperHandle>(null)

  const [file, setFile] = useState<File | null>(null)
  const [cropReady, setCropReady] = useState(false)
  const [busy, setBusy] = useState(false)

  const config = SHAPE_CONFIG[shape]
  const mode = file ? 'crop' : 'view'

  // Ao fechar, volta ao estado inicial (não reabre no meio de um recorte).
  useEffect(() => {
    if (!open) {
      setFile(null)
      setCropReady(false)
    }
  }, [open])

  function handleClose() {
    if (busy) return
    onClose()
  }

  function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    // Zera para permitir reescolher o mesmo arquivo depois.
    event.target.value = ''
    if (!picked) return
    if (!ACCEPTED_TYPES.includes(picked.type)) {
      toast.error('Envie uma imagem PNG, JPG ou WEBP.')
      return
    }
    if (picked.size > MAX_ORIGINAL_BYTES) {
      toast.error('Imagem muito grande. Escolha uma até 30 MB.')
      return
    }
    setCropReady(false)
    setFile(picked)
  }

  async function handleSave() {
    if (!cropperRef.current) return
    setBusy(true)
    try {
      const blob = await cropperRef.current.getCroppedBlob()
      if (!blob) {
        toast.error('Não foi possível recortar a imagem. Tente outra.')
        return
      }
      const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
      const cropped = new File([blob], `${shape}.${ext}`, { type: blob.type })
      await onSave(cropped)
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível salvar a imagem.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!onRemove) return
    setBusy(true)
    try {
      await onRemove()
      onClose()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover a imagem.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title={label} description={hint} maxWidth="max-w-lg">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handlePick}
      />

      {mode === 'view' ? (
        <div className="space-y-5">
          <div className={cn('flex w-full', shape === 'circle' && 'justify-center')}>
            {value ? (
              <img
                src={value}
                alt={name}
                className={cn(
                  'border border-line bg-background object-cover',
                  shape === 'banner' ? 'aspect-[16/9] w-full rounded-xl' : 'h-40 w-40 rounded-full',
                )}
              />
            ) : (
              <div
                className={cn(
                  'flex items-center justify-center border border-dashed border-line bg-background text-ink-tertiary',
                  shape === 'banner' ? 'aspect-[16/9] w-full rounded-xl' : 'h-40 w-40 rounded-full',
                )}
              >
                <ImagePlus className="h-8 w-8" strokeWidth={1.6} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {value && onRemove && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                isLoading={busy}
                leftIcon={busy ? undefined : <Trash2 className="h-4 w-4" />}
                onClick={handleRemove}
              >
                Remover
              </Button>
            )}
            <Button
              type="button"
              disabled={busy}
              leftIcon={<Upload className="h-4 w-4" />}
              onClick={() => inputRef.current?.click()}
            >
              {value ? 'Trocar imagem' : 'Enviar imagem'}
            </Button>
          </div>
        </div>
      ) : (
        file && (
          <div className="space-y-5">
            <ImageCropper
              ref={cropperRef}
              file={file}
              shape={shape}
              aspect={config.aspect}
              outputWidth={config.outputWidth}
              outputHeight={config.outputHeight}
              onReadyChange={setCropReady}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setFile(null)
                  setCropReady(false)
                }}
              >
                Cancelar
              </Button>
              <Button type="button" disabled={busy || !cropReady} isLoading={busy} onClick={handleSave}>
                Salvar
              </Button>
            </div>
          </div>
        )
      )}
    </Dialog>
  )
}
