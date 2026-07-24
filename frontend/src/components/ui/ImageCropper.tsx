import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '../../lib/format'

export interface ImageCropperHandle {
  /** Recorta a região visível no frame e devolve um WebP (ou null se algo falhar). */
  getCroppedBlob: () => Promise<Blob | null>
}

interface ImageCropperProps {
  /** Arquivo escolhido pelo usuário (ainda não enviado). */
  file: File
  /** 'circle' mostra máscara circular (logo); 'banner' é um retângulo. */
  shape: 'circle' | 'banner'
  /** Proporção do frame (largura/altura). Ex.: 1 para logo, 16/9 para banner. */
  aspect: number
  /** Resolução exportada. */
  outputWidth: number
  outputHeight: number
  /** Avisa o pai quando a imagem terminou de decodificar (habilita "Salvar"). */
  onReadyChange?: (ready: boolean) => void
}

interface Loaded {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

const MAX_ZOOM = 4
const MAX_DPR = 2

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/**
 * Decodifica o arquivo já com a orientação do EXIF aplicada (fotos de celular não
 * ficam deitadas). Cai para ImageBitmap sem opção e, por fim, para HTMLImageElement.
 * Os caminhos de fallback (Safari muito antigo, sem createImageBitmap) podem não
 * honrar o EXIF; o caminho principal cobre todos os navegadores atuais.
 */
async function loadImage(file: File): Promise<Loaded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
    } catch {
      /* tenta sem orientação */
    }
    try {
      const bmp = await createImageBitmap(file)
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close?.() }
    } catch {
      /* cai para <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Falha ao carregar a imagem'))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/**
 * Editor de imagem estilo "foto de perfil": arraste para posicionar, use o controle
 * (ou a roda/pinça) para dar zoom. O frame fixo (círculo ou banner) define o recorte,
 * que sempre fica coberto pela imagem. O recorte final sai via `getCroppedBlob`.
 */
export const ImageCropper = forwardRef<ImageCropperHandle, ImageCropperProps>(function ImageCropper(
  { file, shape, aspect, outputWidth, outputHeight, onReadyChange },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [frameW, setFrameW] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ tx: 0, ty: 0 })

  const frameH = frameW / aspect
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_DPR) : 1

  // Refs para a geometria e o zoom atual, usados dentro dos handlers de ponteiro
  // (que rodam fora do ciclo de render e precisam dos valores mais recentes).
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const geomRef = useRef({ bw: 0, bh: 0, frameW: 0, frameH: 0, cover: 1 })

  // Escala mínima para a imagem cobrir o frame (zoom = 1). Recalculada quando a
  // imagem ou o frame mudam.
  const coverScale =
    loaded && frameW > 0 ? Math.max(frameW / loaded.width, frameH / loaded.height) : 1

  useEffect(() => {
    geomRef.current = {
      bw: loaded?.width ?? 0,
      bh: loaded?.height ?? 0,
      frameW,
      frameH,
      cover: coverScale,
    }
  }, [loaded, frameW, frameH, coverScale])

  const clampOffset = useCallback((tx: number, ty: number, z: number) => {
    const g = geomRef.current
    if (!g.bw || !g.frameW) return { tx: 0, ty: 0 }
    const dispW = g.bw * g.cover * z
    const dispH = g.bh * g.cover * z
    const maxTx = Math.max(0, (dispW - g.frameW) / 2)
    const maxTy = Math.max(0, (dispH - g.frameH) / 2)
    return { tx: clamp(tx, -maxTx, maxTx), ty: clamp(ty, -maxTy, maxTy) }
  }, [])

  const applyZoom = useCallback(
    (next: number) => {
      const z = clamp(next, 1, MAX_ZOOM)
      setZoom(z)
      setOffset((o) => clampOffset(o.tx, o.ty, z))
    },
    [clampOffset],
  )

  // Carrega/descarrega a imagem quando o arquivo muda.
  useEffect(() => {
    let cancelled = false
    let current: Loaded | null = null
    setLoaded(null)
    onReadyChange?.(false)
    loadImage(file)
      .then((result) => {
        if (cancelled) {
          result.close()
          return
        }
        current = result
        setLoaded(result)
        setZoom(1)
        setOffset({ tx: 0, ty: 0 })
        onReadyChange?.(true)
      })
      .catch(() => {
        if (!cancelled) onReadyChange?.(false)
      })
    return () => {
      cancelled = true
      current?.close()
    }
  }, [file, onReadyChange])

  // Mede a largura disponível (responsivo). Círculo é limitado a 300px.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const avail = el.clientWidth
      setFrameW(shape === 'circle' ? Math.min(avail, 300) : avail)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [shape])

  // Reclampa o offset se o frame encolher (ex.: girar o celular).
  useEffect(() => {
    setOffset((o) => clampOffset(o.tx, o.ty, zoomRef.current))
  }, [frameW, frameH, clampOffset])

  // Desenha o preview a cada mudança de transformação.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded || frameW <= 0) return
    canvas.width = Math.round(frameW * dpr)
    canvas.height = Math.round(frameH * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, frameW, frameH)

    const dispW = loaded.width * coverScale * zoom
    const dispH = loaded.height * coverScale * zoom
    const left = frameW / 2 + offset.tx - dispW / 2
    const top = frameH / 2 + offset.ty - dispH / 2
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(loaded.source, left, top, dispW, dispH)

    // Máscara circular: escurece os cantos fora do círculo e desenha o anel.
    if (shape === 'circle') {
      const cx = frameW / 2
      const cy = frameH / 2
      const r = Math.min(frameW, frameH) / 2
      ctx.fillStyle = 'rgba(17, 24, 39, 0.5)'
      ctx.beginPath()
      ctx.rect(0, 0, frameW, frameH)
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true)
      ctx.fill('evenodd')
      ctx.beginPath()
      ctx.arc(cx, cy, r - 1, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [loaded, frameW, frameH, zoom, offset, shape, coverScale, dpr])

  // Gestos: 1 ponteiro = arrastar; 2 ponteiros = pinça (zoom).
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchPrev = useRef<number | null>(null)

  function handlePointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }

  function handlePointerMove(e: React.PointerEvent) {
    const pts = pointers.current
    const prev = pts.get(e.pointerId)
    if (!prev) return
    const cur = { x: e.clientX, y: e.clientY }
    pts.set(e.pointerId, cur)

    if (pts.size === 1) {
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      setOffset((o) => clampOffset(o.tx + dx, o.ty + dy, zoomRef.current))
      pinchPrev.current = null
    } else if (pts.size >= 2) {
      const [a, b] = [...pts.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchPrev.current && pinchPrev.current > 0) {
        applyZoom(zoomRef.current * (dist / pinchPrev.current))
      }
      pinchPrev.current = dist
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchPrev.current = null
  }

  // Zoom pela roda/trackpad. Listener nativo NÃO-passivo: o onWheel do React é
  // passivo, então preventDefault ali seria ignorado e a rolagem/zoom vazaria
  // para o diálogo e para o zoom do navegador (ctrl+scroll).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !loaded) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoom(zoomRef.current * (e.deltaY < 0 ? 1.08 : 1 / 1.08))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [loaded, applyZoom])

  useImperativeHandle(
    ref,
    () => ({
      async getCroppedBlob() {
        if (!loaded || frameW <= 0) return null
        const s = 1 / (coverScale * zoom) // px da fonte por px do frame
        const regionW = frameW * s
        const regionH = frameH * s
        const srcCenterX = loaded.width / 2 - offset.tx * s
        const srcCenterY = loaded.height / 2 - offset.ty * s
        const srcLeft = srcCenterX - regionW / 2
        const srcTop = srcCenterY - regionH / 2

        const out = document.createElement('canvas')
        out.width = outputWidth
        out.height = outputHeight
        const ctx = out.getContext('2d')
        if (!ctx) return null
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(
          loaded.source,
          srcLeft,
          srcTop,
          regionW,
          regionH,
          0,
          0,
          outputWidth,
          outputHeight,
        )

        const blob = await new Promise<Blob | null>((resolve) => {
          out.toBlob((b) => resolve(b), 'image/webp', 0.9)
        })
        if (blob && blob.type === 'image/webp') return blob
        // Safari antigo sem WebP: cai para JPEG.
        return new Promise<Blob | null>((resolve) => {
          out.toBlob((b) => resolve(b), 'image/jpeg', 0.9)
        })
      },
    }),
    [loaded, frameW, frameH, zoom, offset, coverScale, outputWidth, outputHeight],
  )

  return (
    <div className="space-y-3">
      <div ref={wrapRef} className={cn('w-full', shape === 'circle' && 'flex justify-center')}>
        {loaded ? (
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ width: frameW, height: frameH, touchAction: 'none' }}
            className={cn(
              'cursor-grab touch-none select-none rounded-xl bg-background active:cursor-grabbing',
              shape === 'banner' && 'border border-line',
            )}
          />
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-xl bg-background text-sm text-ink-tertiary"
            style={{ height: frameW > 0 ? frameW / aspect : 200 }}
          >
            Carregando imagem…
          </div>
        )}
      </div>

      {/* Controle de zoom */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => applyZoom(zoom - 0.2)}
          disabled={!loaded || zoom <= 1}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-secondary transition-colors hover:bg-background disabled:opacity-40"
          aria-label="Diminuir zoom"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          disabled={!loaded}
          onChange={(e) => applyZoom(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-primary disabled:opacity-40"
          aria-label="Zoom"
        />
        <button
          type="button"
          onClick={() => applyZoom(zoom + 0.2)}
          disabled={!loaded || zoom >= MAX_ZOOM}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-ink-secondary transition-colors hover:bg-background disabled:opacity-40"
          aria-label="Aumentar zoom"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="text-center text-xs text-ink-tertiary">
        Arraste para posicionar e use o zoom para enquadrar.
      </p>
    </div>
  )
})
