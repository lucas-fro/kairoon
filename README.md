# Kairoon — Sistema de Agendamentos (MVP Freemium)

SaaS de gestão para barbearias, salões de beleza e clínicas de estética. Multi-tenant desde a base (todas as tabelas relevantes carregam `establishment_id`), com o plano Free liberando 1 estabelecimento e 1 funcionário via regra de negócio — a arquitetura já suporta os planos pagos.

A identidade visual segue o **Kairoon Design System** documentado em [frontend/DESIGN.md](frontend/DESIGN.md) (tokens em `frontend/tailwind.config.ts`). Serviços e o link público são gerenciados dentro de **Configurações**, dividida em tabs.

## Stack

| Camada | Tecnologias |
| --- | --- |
| Backend | Node.js, TypeScript, Fastify 5, Zod, Drizzle ORM (+ migrations), PostgreSQL, JWT (expira em 7 dias) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, lucide-react, TanStack Query, Recharts |

## Como rodar

Pré-requisitos: Node 20+, PostgreSQL rodando em `localhost:5432` (usuário `postgres`, senha `803060`).

```bash
# Backend (porta 3333)
cd backend
npm install
npm run db:create     # cria o banco agendadb (se não existir)
npm run db:migrate    # aplica as migrations
npm run db:seed       # popula a empresa de teste
npm run dev

# Frontend (porta 5173) — em outro terminal
cd frontend
npm install
npm run dev
```

## Acesso de teste (criado pelo seed)

- Painel: http://localhost:5173/login — **admin@barbearia.com** / **admin123**
- Link público de agendamento: http://localhost:5173/navalha-de-ouro

## Estrutura

```
backend/
  src/
    db/            # schema Drizzle, conexão, seed
    lib/           # datetime, slots (cálculo de disponibilidade), errors
    plugins/       # auth (JWT)
    modules/       # 1 pasta por domínio: routes.ts + service.ts + schemas.ts
      auth/ establishment/ services/ employees/ clients/
      appointments/ transactions/ dashboard/ reports/ public/
frontend/
  src/
    api/           # 1 arquivo por módulo, funções tipadas
    components/
      ui/          # kit próprio: Button, Input, Dialog, Toast, Badge...
      layout/      # AppLayout (sidebar do painel)
      agenda/ booking/ settings/
    pages/
      auth/        # login + cadastro (wizard com quiz)
      panel/       # dashboard, agenda, clientes, relatórios, financeiro...
      public/      # wizard público de agendamento (mobile-first)
    contexts/ lib/ types/
```

## Convenções importantes

- **Dinheiro em centavos** (`priceCents`, `amountCents`) — formatação só na borda da UI.
- **Datas como `'YYYY-MM-DD'` e horários `'HH:mm'`** (strings, fuso local) — nunca `new Date('YYYY-MM-DD')`, que desloca o dia em fusos negativos.
- **Design tokens** centralizados em `frontend/tailwind.config.ts` (cores, fontes Inter/Plus Jakarta Sans, sombras) — troque lá e o app inteiro acompanha; regras de uso em `frontend/DESIGN.md`.
- Agendamento concluído gera transação de entrada automaticamente (e o estorno remove).
- A agenda do painel faz polling (15s) — reservas feitas no link público aparecem sozinhas.

## Regras do plano Free

- 1 estabelecimento por conta e 1 funcionário (criado automaticamente no cadastro com o nome do dono).
- Limite aplicado por regra de negócio (`403` na API + tela de upgrade na UI), não por arquitetura.
