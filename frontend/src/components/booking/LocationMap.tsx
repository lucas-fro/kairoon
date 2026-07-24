import { MapPin, Navigation } from 'lucide-react'
import type { PublicEstablishment } from '../../types/api'

type Address = Pick<
  PublicEstablishment['establishment'],
  'name' | 'address' | 'addressNumber' | 'neighborhood' | 'city' | 'state' | 'cep'
>

/** Monta o endereço legível ("Rua X, 100 - Centro, Cidade - UF, CEP"). */
function formatAddress(a: Address): string {
  const line1 = [a.address, a.addressNumber].filter(Boolean).join(', ')
  const line2 = [a.neighborhood, a.city].filter(Boolean).join(', ')
  const line3 = [a.state, a.cep].filter(Boolean).join(', ')
  return [line1, line2, line3].filter(Boolean).join(' - ')
}

/**
 * Mini mapa do Google com um pin no endereço do estabelecimento (link público).
 * Usa o embed sem chave (`output=embed`), que já geocodifica o endereço e planta
 * o marcador. Só aparece quando há rua + cidade (senão o pin não seria preciso).
 */
export function LocationMap(establishment: Address) {
  const hasLocation = Boolean(establishment.address?.trim() && establishment.city?.trim())
  if (!hasLocation) return null

  const full = formatAddress(establishment)
  const query = encodeURIComponent(full)
  const embedUrl = `https://maps.google.com/maps?q=${query}&z=16&output=embed`
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`

  return (
    <section className="mt-12 w-full max-w-2xl" aria-labelledby="welcome-location-heading">
      <h2
        id="welcome-location-heading"
        className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-ink-tertiary"
      >
        Localização
      </h2>

      <div className="mt-5 overflow-hidden rounded-xl border border-line-divider">
        <iframe
          title={`Mapa da localização de ${establishment.name}`}
          src={embedUrl}
          className="h-56 w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-sm text-ink-secondary">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
        <span className="break-words">{full}</span>
      </p>

      <div className="mt-3 flex justify-center">
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-secondary transition-colors duration-150 hover:border-secondary hover:bg-surface-hover"
        >
          <Navigation className="h-4 w-4" />
          Como chegar
        </a>
      </div>
    </section>
  )
}
