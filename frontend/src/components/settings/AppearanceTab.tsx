import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Lock, Save } from 'lucide-react'
import { ApiError } from '../../api/client'
import { updateEstablishment } from '../../api/establishment'
import { useAuth } from '../../contexts/AuthContext'
import { BrandBanner } from '../booking/BrandBanner'
import { KairoonMark } from '../brand/Logo'
import type { Establishment } from '../../types/api'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { useToast } from '../ui/Toast'

const SYSTEM_PRIMARY = '#1E2F5E'
const HEX_REGEX = /^#[0-9a-fA-F]{6}$/

interface AppearanceTabProps {
  establishment: Establishment
}

export function AppearanceTab({ establishment }: AppearanceTabProps) {
  const { setEstablishment } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const isPaid = establishment.plan !== 'free'

  const [themeColor, setThemeColor] = useState(
    HEX_REGEX.test(establishment.themeColor) ? establishment.themeColor : SYSTEM_PRIMARY,
  )
  const [bannerImageUrl, setBannerImageUrl] = useState(establishment.bannerImageUrl ?? '')
  const [footerMessage, setFooterMessage] = useState(establishment.footerMessage ?? '')
  const [welcomeMessage, setWelcomeMessage] = useState(establishment.welcomeMessage ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      updateEstablishment({
        themeColor,
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

  // O preview reflete exatamente o que o visitante vê hoje: grátis usa a cor do
  // sistema + marca Kairoon; pago aplica cor/banner/mensagem escolhidos.
  const previewColor = isPaid ? themeColor : SYSTEM_PRIMARY
  const previewBanner = isPaid ? bannerImageUrl.trim() || null : null

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <CardTitle>Aparência do link público</CardTitle>
        {!isPaid && (
          <Badge tone="brand">
            <Lock className="h-3 w-3" />
            Disponível no plano Pro
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Preview */}
        <div className="rounded-xl border border-line-divider bg-background p-4">
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
            <p className="mt-1 text-center text-sm text-ink-secondary">
              {welcomeMessage.trim()}
            </p>
          )}
          <div className="mt-3 text-center text-xs text-ink-tertiary">
            {isPaid ? (
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

        {/* Cor do tema */}
        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink-secondary">Cor da marca</span>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={themeColor}
              disabled={!isPaid}
              onChange={(e) => setThemeColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface p-1 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Cor da marca"
            />
            <input
              type="text"
              value={themeColor}
              disabled={!isPaid}
              onChange={(e) => {
                const value = e.target.value
                if (HEX_REGEX.test(value)) setThemeColor(value)
                else setThemeColor(value.startsWith('#') ? value : `#${value}`)
              }}
              placeholder="#1E2F5E"
              className="h-10 w-32 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-tertiary focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary-light disabled:cursor-not-allowed disabled:bg-background disabled:text-ink-disabled"
              aria-label="Cor da marca (hex)"
            />
          </div>
        </div>

        {/* Banner e mensagem */}
        <Input
          label="Imagem do banner (URL)"
          type="url"
          value={bannerImageUrl}
          onChange={(e) => setBannerImageUrl(e.target.value)}
          placeholder="https://exemplo.com/banner.jpg"
          hint="Opcional. Sem imagem, o banner usa a cor da marca."
          disabled={!isPaid}
        />
        <Input
          label="Mensagem de rodapé"
          value={footerMessage}
          onChange={(e) => setFooterMessage(e.target.value)}
          placeholder="Ex.: Barbearia do Zé desde 2010"
          hint="Substitui a marca “Agendamento feito pela Kairoon”."
          disabled={!isPaid}
        />

        {isPaid ? (
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
          <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-ink-secondary">
              Personalize as cores, o banner e a mensagem da sua página fazendo upgrade para o
              plano Pro.
            </p>
            <Button
              className="shrink-0"
              onClick={() => navigate('/app/configuracoes?tab=plano')}
            >
              Conhecer planos
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
