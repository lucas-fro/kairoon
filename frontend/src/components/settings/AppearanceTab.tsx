import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, Lock, Save } from 'lucide-react'
import { ApiError } from '../../api/client'
import { updateEstablishment } from '../../api/establishment'
import { uploadImage } from '../../api/uploads'
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
import { ImageEditField } from '../ui/ImageEditField'
import { Input } from '../ui/Input'
import { Switch } from '../ui/Switch'
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
      aria-label={palette.label}
      title={palette.label}
      className={cn(
        'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition-all',
        selected ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-ink/30',
        disabled && 'cursor-not-allowed opacity-50',
      )}
      style={{ backgroundColor: palette.primary }}
    >
      {selected && (
        <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: readableTextColor(palette.primary) }} />
      )}
      <span className="absolute bottom-0.5 right-0.5 flex gap-0.5">
        <span
          className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: palette.secondary }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: palette.accent }}
        />
      </span>
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
  const [logoUrl, setLogoUrl] = useState(establishment.logoUrl ?? '')
  const [bannerImageUrl, setBannerImageUrl] = useState(establishment.bannerImageUrl ?? '')
  const [footerMessage, setFooterMessage] = useState(establishment.footerMessage ?? '')
  const [welcomeMessage, setWelcomeMessage] = useState(establishment.welcomeMessage ?? '')
  const [showInstagram, setShowInstagram] = useState(establishment.showInstagram)
  const [showWhatsapp, setShowWhatsapp] = useState(establishment.showWhatsapp)

  const hasInstagram = Boolean(establishment.socials?.instagram)
  const hasWhatsapp = Boolean(establishment.socials?.whatsapp)

  const isCustom = paletteKey === CUSTOM_PALETTE_KEY
  const selectedPalette: Palette = isCustom
    ? customPaletteFromHex(HEX_REGEX.test(customColor) ? customColor : SYSTEM_PRIMARY)
    : (PALETTE_MAP[paletteKey] ?? DEFAULT_PALETTE)

  // Um único save para a aba inteira. Campos de plano pago (palette/themeColor/
  // bannerImageUrl/footerMessage) são ignorados pelo backend quando o plano não
  // tem `personalizacao` (ver service.ts), então é seguro sempre mandar tudo.
  const mutation = useMutation({
    mutationFn: () =>
      updateEstablishment({
        palette: paletteKey,
        // themeColor continua sendo a cor primária efetiva (banner/CTA do link).
        // selectedPalette.primary já é hex válido tanto no preset quanto no custom.
        themeColor: selectedPalette.primary,
        bannerImageUrl: bannerImageUrl.trim(),
        footerMessage: footerMessage.trim(),
        welcomeMessage: welcomeMessage.trim(),
        showInstagram,
        showWhatsapp,
      }),
    onSuccess: (res) => {
      setEstablishment(res)
      toast.success('Aparência atualizada!')
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
          <div className="flex flex-wrap gap-2">
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
              aria-label="Cor personalizada"
              title="Cor personalizada"
              className={cn(
                'relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition-all',
                isCustom ? 'ring-2 ring-ink' : 'ring-1 ring-line hover:ring-ink/30',
                !hasPersonalizacao && 'cursor-not-allowed opacity-50',
              )}
              style={{
                background:
                  'conic-gradient(from 180deg, #ef4444, #f59e0b, #22c55e, #06b6d4, #3b82f6, #a855f7, #ec4899, #ef4444)',
              }}
            >
              {isCustom && <Check className="h-3.5 w-3.5 text-white drop-shadow" strokeWidth={3} />}
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
            logoUrl={logoUrl || null}
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
        <Textarea
          label="Mensagem de boas-vindas"
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder="Ex.: Bem-vindo! Escolha um horário e até já."
          hint="Aparece no topo do seu link público."
        />

        {/* Logo e banner: prévia + lápis abrem o editor (recorte/zoom/posição) */}
        <ImageEditField
          label="Logo do estabelecimento (opcional)"
          hint="PNG, JPG ou WEBP. Aparece no link público."
          value={logoUrl || null}
          name={establishment.name}
          shape="circle"
          onSave={async (file) => {
            const { url } = await uploadImage('logo', file, logoUrl || null)
            setLogoUrl(url)
            const res = await updateEstablishment({ logoUrl: url })
            setEstablishment(res)
            toast.success('Logo atualizado!')
          }}
          onRemove={async () => {
            setLogoUrl('')
            const res = await updateEstablishment({ logoUrl: '' })
            setEstablishment(res)
            toast.success('Logo removido')
          }}
        />
        <ImageEditField
          label="Imagem do banner"
          hint="PNG, JPG ou WEBP. Sem imagem, o banner usa a cor da paleta."
          value={bannerImageUrl || null}
          name={establishment.name}
          shape="banner"
          disabled={!hasPersonalizacao}
          onSave={async (file) => {
            const { url } = await uploadImage('banner', file, bannerImageUrl || null)
            setBannerImageUrl(url)
            const res = await updateEstablishment({ bannerImageUrl: url })
            setEstablishment(res)
            toast.success('Banner atualizado!')
          }}
          onRemove={async () => {
            setBannerImageUrl('')
            const res = await updateEstablishment({ bannerImageUrl: '' })
            setEstablishment(res)
            toast.success('Banner removido')
          }}
        />
        <Input
          label="Mensagem de rodapé"
          value={footerMessage}
          onChange={(e) => setFooterMessage(e.target.value)}
          placeholder="Ex.: Barbearia do Zé desde 2010"
          hint="Substitui a marca “Agendamento feito pela Kairoon”."
          disabled={!hasPersonalizacao}
        />

        {/* Exibição das redes no link público (vale em qualquer plano). O @/telefone
            é cadastrado em Configurações › Dados do estabelecimento. */}
        <div className="space-y-3">
          <div>
            <p className="text-[13px] font-medium text-ink-secondary">Redes no link público</p>
            <p className="mt-0.5 text-xs text-ink-tertiary">
              Escolha o que aparece na página. O @ e o telefone ficam em Dados do estabelecimento.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
              <img src="/instagram.svg" alt="" className="h-4 w-4" />
              Instagram
              {!hasInstagram && (
                <span className="text-xs font-normal text-ink-tertiary">(nenhum cadastrado)</span>
              )}
            </span>
            <Switch
              checked={showInstagram}
              onChange={setShowInstagram}
              disabled={!hasInstagram}
              aria-label="Exibir Instagram no link público"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line px-4 py-3">
            <span className="flex items-center gap-2.5 text-sm font-medium text-ink">
              <img src="/whatsapp.svg" alt="" className="h-4 w-4" />
              WhatsApp
              {!hasWhatsapp && (
                <span className="text-xs font-normal text-ink-tertiary">(nenhum cadastrado)</span>
              )}
            </span>
            <Switch
              checked={showWhatsapp}
              onChange={setShowWhatsapp}
              disabled={!hasWhatsapp}
              aria-label="Exibir WhatsApp no link público"
            />
          </div>
        </div>

        {!hasPersonalizacao && <UpgradePrompt plan="Básico" compact />}

        <div className="flex justify-end">
          <Button
            onClick={() => mutation.mutate()}
            isLoading={mutation.isPending}
            leftIcon={<Save className="h-4 w-4" />}
          >
            Salvar aparência
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
