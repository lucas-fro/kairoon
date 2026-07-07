import { KairoonMark } from '../brand/Logo'
import { readableTextColor } from '../../lib/color'
import { cn } from '../../lib/format'

interface BrandBannerProps {
  brandColor: string
  bannerImageUrl: string | null
  logoUrl: string | null
  name: string
  className?: string
  /** `false` deixa o banner com cantos retos, para uso encostado nas bordas da tela. */
  rounded?: boolean
}

/**
 * Faixa de topo do link público com um círculo de logo centralizado que
 * transpassa a borda inferior (metade sobre o banner, metade para fora). O
 * fundo é uma imagem (quando houver) ou a cor de marca sólida.
 */
export function BrandBanner({
  brandColor,
  bannerImageUrl,
  logoUrl,
  name,
  className,
  rounded = true,
}: BrandBannerProps) {
  const fg = readableTextColor(brandColor)

  return (
    <div className={cn('relative w-full pb-14', className)}>
      <div
        className={cn('h-32 w-full overflow-hidden', rounded && 'rounded-2xl')}
        style={{ backgroundColor: brandColor }}
      >
        {bannerImageUrl && (
          <img src={bannerImageUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>

      {/* Círculo do logo, centro na borda inferior do banner */}
      <div className="absolute left-1/2 top-32 h-24 w-24 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-4 border-surface bg-surface shadow-card">
        {logoUrl ? (
          <img src={logoUrl} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center rounded-full"
            style={{ backgroundColor: brandColor, color: fg }}
          >
            <KairoonMark className="h-9 w-auto" />
          </div>
        )}
      </div>
    </div>
  )
}
