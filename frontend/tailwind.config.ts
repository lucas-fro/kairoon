import type { Config } from 'tailwindcss'

/**
 * Kairoon Design System v1.0 — tokens centrais (ver frontend/DESIGN.md).
 * Troque aqui e o app inteiro acompanha. Nos componentes use SEMPRE as
 * classes semânticas (bg-primary, text-ink-secondary, border-line...),
 * nunca hex hardcoded nem cores cruas do Tailwind.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E2F5E',
          hover: '#243A75',
          active: '#17264A',
        },
        secondary: {
          DEFAULT: '#6EA8FE',
          hover: '#5592F7',
          light: '#EAF2FF',
        },
        accent: '#C7D9FF',
        success: { DEFAULT: '#22C55E', light: '#DCFCE7', dark: '#15803D' },
        warning: { DEFAULT: '#F59E0B', light: '#FEF3C7', dark: '#B45309' },
        error: { DEFAULT: '#EF4444', light: '#FEE2E2', dark: '#B91C1C' },
        info: { DEFAULT: '#38BDF8', light: '#E0F2FE', dark: '#0369A1' },
        background: '#F6F8FC',
        surface: { DEFAULT: '#FFFFFF', hover: '#FAFBFD' },
        line: { DEFAULT: '#E8EDF5', divider: '#EEF2F7' },
        ink: {
          DEFAULT: '#0F172A',
          secondary: '#475569',
          tertiary: '#94A3B8',
          disabled: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.05)',
        soft: '0 4px 8px rgba(15,23,42,0.06)',
        elevated: '0 10px 25px rgba(15,23,42,0.08)',
        floating: '0 20px 40px rgba(15,23,42,0.12)',
      },
      // Escala de raio reduzida — visual mais sóbrio/menos arredondado.
      // Mantém a hierarquia (badge < input/botão < card < modal) e o rounded-full
      // dos avatares/dots intacto.
      borderRadius: {
        md: '4px', // badge
        lg: '6px', // input, botão
        xl: '8px', // card, dropdown
        '2xl': '10px', // modal
      },
    },
  },
  plugins: [],
} satisfies Config
