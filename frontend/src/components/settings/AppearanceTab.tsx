import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Lock, Save } from 'lucide-react'
import { ApiError } from '../../api/client'
import { updateEstablishment } from '../../api/establishment'
import { useAuth } from '../../contexts/AuthContext'
import { usePlan } from '../../hooks/usePlan'
import { readableTextColor } from '../../lib/color'
import { cn } from '../../lib/format'
import {
  CUSTOM_PALETTE_KEY,
  DEFAULT_PALETTE,
  DEFAULT_PALETTE_KEY,
  PALETTES,
  PALETTE_MAP,
  customPaletteFromHex,
  paletteStyle,
} from '../../lib/palettes'
import type { Palette } from '../../lib/palettes'
import { BrandBanner } from '../booking/BrandBanner'
import { KairoonMark } from '../brand/Logo'
import { UpgradePrompt } from '../plan/UpgradePrompt'
import type { Establishment } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../ui/Toast'

const SYSTEM_PRIMARY = '#1E2F5E'
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/
// Cores "de sistema" (navy atual + default legado do banco): não contam como
// escolha personalizada. Caem na paleta Padrão em vez de "Personalizada".
const SYSTEM_DEFAULT_COLORS = new Set(['#1e2f5e', '#0f4c5c'])

interface AppearanceTabProps {
  establishment: Establishment
}

/** Um quadradinho de paleta (cor primária + amostras de secundária/acento). */
function PaletteSwatch({
  palette,
  selected,
  disabled,
  onSelect,
}: {
  palette: Palette
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      title={palette.label}
      className={cn(
        'flex flex-col items-center gap-1.5 rounded-lg p-1 transition-opacity',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg ring-offset-2 ring-offset-surface transition-all',
          selected ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-ink/30',
        )}
        style={{ backgroundColor: palette.primary }}
      >
        {selected && (
          <Check className="h-4 w-4" strokeWidth={3} style={{ color: readableTextColor(palette.primary) }} />
        )}
        <span className="absolute bottom-1 right-1 flex gap-0.5">
          <span
            className="h-2 w-2 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: palette.secondary }}
          />
          <span
            className="h-2 w-2 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: palette.accent }}
          />
        </span>
      </span>
      <span className="w-full truncate text-center text-[11px] text-ink-secondary">{palette.label}</span>
    </button>
  )
}

export function AppearanceTab({ establishment }: AppearanceTabProps) {
  const { setEstablishment } = useAuth()
  const toast = useToast()

  // Personalização segue o plano EFETIVO (getPlan): cobre o teste grátis, cuja
  // coluna `plan` é 'free' mas o acesso é Essencial. Enquanto o plano carrega (ou
  // se a query falhar) cai na coluna crua como fallback otimista, evitando piscar
  // "bloqueado" para quem já tem acesso.
  const { data: plan } = usePlan()
  const hasPersonalizacao = plan ? plan.features.personalizacao : establishment.plan !== 'free'

  // Chave da paleta escolhida: preset conhecido, 'custom' (cor livre) ou padrão.
  const [paletteKey, setPaletteKey] = useState<string>(() => {
    const stored = establishment.palette
    if (stored && PALETTE_MAP[stored]) return stored
    if (stored === CUSTOM_PALETTE_KEY) return CUSTOM_PALETTE_KEY
    // Legado (sem paleta salva): tenta casar a cor com um preset; senão, só vira
    // "Personalizada" se a cor foi de fato customizada (não uma cor de sistema).
    const hex = establishment.themeColor
    if (HEX_REGEX.test(hex)) {
      const match = PALETTES.find((p) => p.primary.toLowerCase() === hex.toLowerCase())
      if (match) return match.key
      if (!SYSTEM_DEFAULT_COLORS.has(hex.toLowerCase())) return CUSTOM_PALETTE_KEY
    }
    return DEFAULT_PALETTE_KEY
  })
  const [customColor, setCustomColor] = useState(
    HEX_REGEX.test(establishment.themeColor) ? establishment.themeColor : SYSTEM_PRIMARY,
  )
  const [bannerImageUrl, setBannerImageUrl] = useState(establishment.bannerImageUrl ?? '')
  const [footerMessage, setFooterMessage] = useState(establishment.footerMessage ?? '')
  const [welcomeMessage, setWelcomeMessage] = useState(establishment.welcomeMessage ?? '')

  const isCustom = paletteKey === CUSTOM_PALETTE_KEY
  const selectedPalette: Palette = isCustom
    ? customPaletteFromHex(HEX_REGEX.test(customColor) ? customColor : SYSTEM_PRIMARY)
    : (PALETTE_MAP[paletteKey] ?? DEFAULT_PALETTE)

  const mutation = useMutation({
    mutationFn: () =>
      updateEstablishment({
        palette: paletteKey,
        // themeColor continua sendo a cor primária efetiva (banner/CTA do link).
        // selectedPalette.primary já é hex válido tanto no preset quanto no custom.
        themeColor: selectedPalette.primary,
        bannerImageUrl: bannerImageUrl.trim(),
        footerMessage: footerMessage.trim(),
      }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Aparência atualizada!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  // Mensagem de boas-vindas: disponível em qualquer plano e salva sozinha.
  const welcomeMutation = useMutation({
    mutationFn: (value: string) => updateEstablishment({ welcomeMessage: value }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Mensagem de boas-vindas salva!')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  // O preview reflete o que fica valendo: grátis usa a paleta padrão + marca
  // Kairoon; pago aplica a paleta escolhida (sistema + link).
  const previewPalette = hasPersonalizacao ? selectedPalette : DEFAULT_PALETTE
  const previewColor = previewPalette.primary
  const previewBanner = hasPersonalizacao ? bannerImageUrl.trim() || null : null

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Aparência e cores</CardTitle>
        {!hasPersonalizacao && (
          <Badge tone="brand">
            <Lock className="h-3 w-3" />
            Disponível no plano Básico
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Paleta de cores: aplica ao painel (sistema) e ao link público */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[13px] font-medium text-ink-secondary">Paleta de cores</span>
            <span className="text-xs text-ink-tertiary">Aplica ao sistema e ao link público</span>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {PALETTES.map((p) => (
              <PaletteSwatch
                key={p.key}
                palette={p}
                selected={paletteKey === p.key}
                disabled={!hasPersonalizacao}
                onSelect={() => setPaletteKey(p.key)}
              />
            ))}
            {/* Cor personalizada (fora dos presets) */}
            <button
              type="button"
              onClick={() => setPaletteKey(CUSTOM_PALETTE_KEY)}
              disabled={!hasPersonalizacao}
              aria-pressed={isCustom}
              title="Cor personalizada"
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg p-1 transition-opacity',
                !hasPersonalizacao && 'cursor-not-allowed opacity-50',
              )}
            >
              <span
                className={cn(
                  'relative flex h-11 w-full items-center justify-center overflow-hidden rounded-lg ring-offset-2 ring-offset-surface transition-all',
                  isCustom ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-ink/30',
                )}
                style={{
                  background:
                    'conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
                }}
              >
                {isCustom && <Check className="h-4 w-4 text-white drop-shadow" strokeWidth={3} />}
              </span>
              <span className="w-full truncate text-center text-[11px] text-ink-secondary">
                Personalizada
              </span>
            </button>
          </div>

          {/* Seletor de cor livre: só quando "Personalizada" está ativa */}
          {isCustom && (
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={HEX_REGEX.test(customColor) ? customColor : SYSTEM_PRIMARY}
                disabled={!hasPersonalizacao}
                onChange={(e) => setCustomColor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Cor personalizada"
              />
              <input
                type="text"
                value={customColor}
                disabled={!hasPersonalizacao}
                onChange={(e) => {
                  const value = e.target.value
                  setCustomColor(value.startsWith('#') ? value : `#${value}`)
                }}
                placeholder="#1E2F5E"
                className="h-10 w-32 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled"
                aria-label="Cor personalizada (hex)"
              />
            </div>
          )}
        </div>

        {/* Preview do sistema: reflete a paleta selecionada (tokens escopados) */}
        <div
          className="rounded-xl border border-line-divider bg-background p-4"
          style={paletteStyle(previewPalette)}
        >
          <p className="mb-2 text-xs font-medium text-ink-tertiary">Prévia do sistema</p>
          <div className="flex gap-3">
            <div className="flex w-16 shrink-0 flex-col gap-1.5 rounded-lg bg-primary p-2">
              <div className="h-1.5 w-full rounded bg-white/30" />
              <div className="h-1.5 w-3/4 rounded bg-white/20" />
              <div className="h-1.5 w-full rounded bg-secondary" />
              <div className="h-1.5 w-2/3 rounded bg-white/20" />
            </div>
            <div className="flex flex-1 flex-col items-start justify-center gap-2">
              <span className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white">
                Botão primário
              </span>
              <span className="rounded-md bg-secondary-light px-2 py-1 text-xs font-medium text-primary">
                Item selecionado
              </span>
            </div>
          </div>
        </div>

        {/* Preview do link público */}
        <div className="rounded-xl border border-line-divider bg-background p-4">
          <p className="mb-2 text-xs font-medium text-ink-tertiary">Prévia do link público</p>
          <BrandBanner
            brandColor={previewColor}
            bannerImageUrl={previewBanner}
            logoUrl={establishment.logoUrl}
            name={establishment.name}
          />
          <p className="text-center font-display text-lg font-semibold text-ink">
            {establishment.name}
          </p>
          {welcomeMessage.trim() && (
            <p className="mt-1 text-center text-sm text-ink-secondary">{welcomeMessage.trim()}</p>
          )}
          <div className="mt-3 text-center text-xs text-ink-tertiary">
            {hasPersonalizacao ? (
              footerMessage.trim() ? (
                <span className="text-ink-secondary">{footerMessage.trim()}</span>
              ) : (
                <span>Sem marca Kairoon</span>
              )
            ) : (
              <span className="inline-flex items-center gap-1.5">
                Agendamento feito pela
                <KairoonMark className="h-3 w-auto" />
                Kairoon
              </span>
            )}
          </div>
        </div>

        {/* Mensagem de boas-vindas (topo do link público, disponível em todos os planos) */}
        <div className="space-y-3">
          <Textarea
            label="Mensagem de boas-vindas"
            value={welcomeMessage}
            onChange={(e) => setWelcomeMessage(e.target.value)}
            placeholder="Ex.: Bem-vindo! Escolha um horário e até já."
            hint="Aparece no topo do seu link público."
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => welcomeMutation.mutate(welcomeMessage.trim())}
              isLoading={welcomeMutation.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Salvar mensagem
            </Button>
          </div>
        </div>

        {/* Banner e mensagem */}
        <Input
          label="Imagem do banner (URL)"
          type="url"
          value={bannerImageUrl}
          onChange={(e) => setBannerImageUrl(e.target.value)}
          placeholder="https://exemplo.com/banner.jpg"
          hint="Opcional. Sem imagem, o banner usa a cor da paleta."
          disabled={!hasPersonalizacao}
        />
        <Input
          label="Mensagem de rodapé"
          value={footerMessage}
          onChange={(e) => setFooterMessage(e.target.value)}
          placeholder="Ex.: Barbearia do Zé desde 2010"
          hint="Substitui a marca “Agendamento feito pela Kairoon”."
          disabled={!hasPersonalizacao}
        />

        {hasPersonalizacao ? (
          <div className="flex justify-end">
            <Button
              onClick={() => mutation.mutate()}
              isLoading={mutation.isPending}
              leftIcon={<Save className="h-4 w-4" />}
            >
              Salvar aparência
            </Button>
          </div>
        ) : (
          <UpgradePrompt plan="Básico" compact />
        )}
      </CardContent>
    </Card>
  )
}
