# Kairoon Design System v1.0

Interface premium, clean e respirável para o Kairoon (sistema de agendamentos).
Regra estética central: **60% neutro + 30% brand + 10% status/accent** — muita
superfície branca/cinza claro, azul escuro só onde importa, cores vivas apenas
para feedback.

## Princípios

1. Contraste e espaçamento em vez de bordas pesadas (sombras > bordas).
2. Hierarquia visual antes de decoração.
3. Cantos levemente arredondados — nunca pill-heavy (evitar rounded-full em
   containers; reservado a avatares e dots de status).
4. O usuário entende onde está, o que pode fazer e o que está selecionado em
   menos de 2 segundos.
5. Animações sutis: 120–220ms, ease-out. Nunca bounce/spring.

## Tokens (já configurados em tailwind.config.ts — use SEMPRE as classes)

| Token | Valor | Classe Tailwind |
| --- | --- | --- |
| Primary | `#1E2F5E` | `bg-primary` `text-primary` |
| Primary Hover | `#243A75` | `hover:bg-primary-hover` |
| Primary Active | `#17264A` | `active:bg-primary-active` |
| Secondary | `#6EA8FE` | `bg-secondary` |
| Secondary Hover | `#5592F7` | `bg-secondary-hover` |
| Secondary Light | `#EAF2FF` | `bg-secondary-light` (seleções ativas, highlights) |
| Accent | `#C7D9FF` | `bg-accent` |
| Success / Light / Dark(texto) | `#22C55E` / `#DCFCE7` / `#15803D` | `success` `success-light` `success-dark` |
| Warning / Light / Dark(texto) | `#F59E0B` / `#FEF3C7` / `#B45309` | `warning` … |
| Error / Light / Dark(texto) | `#EF4444` / `#FEE2E2` / `#B91C1C` | `error` … |
| Info / Light / Dark(texto) | `#38BDF8` / `#E0F2FE` / `#0369A1` | `info` … |
| Background | `#F6F8FC` | `bg-background` |
| Surface / Hover | `#FFFFFF` / `#FAFBFD` | `bg-surface` `hover:bg-surface-hover` |
| Border soft / Divider | `#E8EDF5` / `#EEF2F7` | `border-line` `border-line-divider` |
| Texto primário/secundário/terciário/disabled | `#0F172A` `#475569` `#94A3B8` `#CBD5E1` | `text-ink` `text-ink-secondary` `text-ink-tertiary` `text-ink-disabled` |

Sombras: `shadow-card` (cards), `shadow-soft` (dropdown/hover elevado),
`shadow-elevated` (modal), `shadow-floating` (dialogs/command palette).

**Proibido**: hex hardcoded em componente (exceção única: `src/lib/chartColors.ts`),
cores slate/emerald/red/amber do Tailwind — use os tokens acima.

## Tipografia

- Títulos (páginas, cards, dialogs, números de destaque): **Plus Jakarta Sans**
  → `font-display`, pesos 600–700 (nunca 800/900).
- UI/corpo: **Inter** → `font-sans` (padrão), pesos 400–600.
- Escala: título de página `text-2xl font-semibold font-display`; título de card
  `text-base font-semibold font-display`; corpo `text-sm`; suporte `text-[13px]`;
  caption `text-xs text-ink-tertiary`.
- Calendário: Inter 500/600, números altamente legíveis.

## Espaçamento e raio

- Escala de 4px (use só: 2/4/8/12/16/20/24/32/40/48/64px).
- Label→input 8px (`mb-2`); entre inputs 16px (`space-y-4`); entre seções 32px
  (`space-y-8`); entre cards 24px (`gap-6`); padding de card 24px (`p-6`);
  padding lateral de página 32px.
- Raio (escala sóbria, redefinida no tailwind.config): input/botão `rounded-lg`
  (6px) · card/dropdown `rounded-xl` (8px) · modal `rounded-2xl` (10px) · badge
  `rounded-md` (4px). `rounded-full` só em avatar/dot de status. Nunca 12px+ em
  containers.

## Componentes (kit pronto em src/components/ui/ — NUNCA reinvente)

- **Button**: variants `primary` (navy), `secondary` (bg secondary-light, texto
  primary), `outline`, `ghost`, `danger`. Sizes sm(32)/md(40)/lg(48).
- **Input/Select/Textarea**: 40px, borda `line`, foco = borda secondary + anel
  azul suave. Erro = borda error.
- **Card / CardHeader / CardTitle / CardContent**: surface, `rounded-xl`,
  `shadow-card`, sem borda. Nunca lotar um card — 1 foco por card.
- **Badge**: 24px, `rounded-md`, tones `success|warning|error|info|neutral|brand`.
  Status: confirmado/agendado=success · concluído=brand (azul suave) ·
  cancelado=error · pendente=warning.
- **Tabs**: underline (indicador 2px primary), texto inativo ink-tertiary.
- **Dialog**: `rounded-2xl`, `shadow-floating`, overlay ink/40 + blur.
- **Table (ui/Table.tsx)**: header Inter 12/600 ink-tertiary (sem uppercase),
  linhas 56px, divisor `line-divider`, hover `surface-hover`, selecionado
  `secondary-light`.
- **EmptyState, Skeleton (preferir a spinners), Toast, PageHeader, Spinner**.

## Sidebar (AppLayout)

Fundo `bg-primary` (navy) 280px — âncora de identidade da marca. Marca = quadrado
branco com "K" em primary. Itens h-10 `rounded-lg` em `text-white/70`; ativo =
`bg-white/10 text-white` + indicador esquerdo 3px `bg-secondary` (único ponto de
secondary aqui); grupos com label `text-white/40`; usuário no rodapé com avatar
`bg-white/15`. Ícones lucide 18px.

## Calendário (agenda)

Hora = 64px (30min = 32px). Linhas do grid `border-line-divider`. Rótulos de
hora Inter 12/500 `text-ink-tertiary`. Blocos: cantos retos (sem raio), sombra
card, SEM barra lateral — a cor de fundo carrega o status: confirmado=
`bg-success-light`, concluído=`bg-primary/10` (navy), cancelado=`bg-error-light`
esmaecido. Blocos ≥40px mostram 2 linhas; menores, 1 linha.

## Gráficos (Reports)

Cores APENAS de `src/lib/chartColors.ts` (validadas p/ daltonismo): série/income
`#3B7DE0`, expense `#D97706`. Grid horizontal `#EEF2F7`, texto de eixo
`#94A3B8` 12px. Um eixo Y por gráfico. Barras finas com radius 4 no topo.

## Interação

Hover: leve elevação OU fundo suave — nunca os dois. Disabled: opacity-40 sem
sombra. Loading: skeletons > spinners. Transições `transition-colors
duration-150` (ou 200ms para elevação).
