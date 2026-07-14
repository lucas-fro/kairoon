import type { ReactNode } from 'react'
import { KairoonLogotype } from '../brand/Logo'

/**
 * Casca visual das telas de autenticação (login e recuperação de senha): painel
 * de marca com foto à esquerda (desktop) e o card do formulário à direita. O
 * conteúdo do card vem por `children`.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Painel de marca com foto — visível em telas grandes */}
      <aside className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2 xl:w-[55%]">
        <img src="/imgTelaLogin.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/80 to-primary/45" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-primary/90 via-transparent to-transparent" />

        <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
          <KairoonLogotype className="h-24 w-auto text-white" />

          <div className="max-w-lg">
            <h2 className="font-display text-4xl font-bold leading-[1.15] text-white xl:text-[2.75rem]">
              A plataforma que transforma tempo em crescimento.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/80">
              Centralize agendamentos, operação, clientes e gestão em um único sistema para sua
              empresa operar com mais precisão, controle e previsibilidade.
            </p>
          </div>

          <p className="text-sm font-medium tracking-wide text-white/70">
            Precisão no tempo. Direção no crescimento.
          </p>
        </div>
      </aside>

      {/* Painel do formulário */}
      <div className="relative flex w-full flex-col items-center justify-center px-4 py-12 lg:w-1/2 lg:bg-background xl:w-[45%]">
        {/* Fundo com foto + filtro navy — só no mobile */}
        <img
          src="/imgTelaLogin.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover lg:hidden"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/85 to-primary/70 lg:hidden" />

        {/* Logo sobre o fundo — só no mobile */}
        <KairoonLogotype className="relative z-10 mb-8 h-14 w-auto text-white lg:hidden" />

        {/* Card do form — branco com sombra flutuante em todas as telas */}
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-surface p-6 shadow-floating sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
