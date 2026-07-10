# Kairoon — Sistema de Agendamentos & Gestão

SaaS de gestão para barbearias, salões de beleza e clínicas de estética: agenda, clientes, estoque, financeiro, comissões, relatórios, link público de agendamento e um sistema completo de marketing/fidelidade (cupons, campanhas, cartão fidelidade e pontos).

Multi-tenant desde a base — todas as tabelas de domínio carregam `establishment_id` e o isolamento é garantido em cada consulta a partir do `establishmentId` que vem no JWT. O plano Free é aplicado por regra de negócio (não por arquitetura), então os planos pagos já cabem no modelo.

A identidade visual segue o **Kairoon Design System** documentado em [frontend/DESIGN.md](frontend/DESIGN.md) (tokens em `frontend/tailwind.config.ts`).

---

## Sumário

- [Stack](#stack)
- [Como rodar](#como-rodar)
- [Arquitetura](#arquitetura)
- [Features do sistema](#features-do-sistema)
- [API — rotas](#api--rotas)
- [Banco de dados](#banco-de-dados)
- [Migrations](#migrations)
- [Convenções importantes](#convenções-importantes)

---

## Stack

| Camada | Tecnologias |
| --- | --- |
| Backend | Node.js 20+, TypeScript (ESM, rodado via `tsx`), Fastify 5, Zod, Drizzle ORM, PostgreSQL, JWT (`@fastify/jwt`, expira em 7 dias), bcryptjs, `@fastify/cors`, `@fastify/rate-limit`, Resend (e-mail transacional) |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router, lucide-react, Recharts |
| Tempo real | Server-Sent Events (SSE) para avisar o painel de reservas do link público |

---

## Como rodar

Pré-requisitos: Node 20+, PostgreSQL em `localhost:5432`. As credenciais e o nome do banco (`agendadb`) têm default em `backend/src/env.ts`, sobreponíveis via `.env`:

| Variável | Default | Observação |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://postgres:803060@localhost:5432/agendadb` | conexão do Postgres |
| `JWT_SECRET` | — (obrigatório, ≥ 20 chars) | sem default de propósito: a app não sobe sem ele |
| `PORT` | `3333` | porta do backend |
| `CORS_ORIGIN` | `http://localhost:5173` | origens permitidas (separadas por vírgula) |
| `RESEND_API_KEY` | — (opcional) | chave da Resend p/ e-mail transacional; sem ela os envios viram no-op logado (útil em dev) |
| `RESEND_FROM` | `Kairoon <onboarding@resend.dev>` | remetente dos e-mails (use domínio verificado em produção) |

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

### Acesso de teste (criado pelo seed)

- Painel: http://localhost:5173/login — **admin@barbearia.com** / **admin123**
- Link público de agendamento: http://localhost:5173/navalha-de-ouro

### Scripts do backend

| Script | O que faz |
| --- | --- |
| `npm run dev` | sobe o servidor com watch (`tsx watch`) |
| `npm run start` | sobe o servidor sem watch |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:create` | cria o banco se não existir |
| `npm run db:generate` | gera uma nova migration a partir do `schema.ts` |
| `npm run db:migrate` | aplica as migrations pendentes |
| `npm run db:seed` | popula a empresa/usuário de teste |
| `npm run db:seed:demo` | popula um estabelecimento demo com ~3 meses de operação (agenda, caixa, fidelidade, pontos); **limpa o banco antes** |

---

## Arquitetura

```
backend/
  drizzle/           # migrations SQL geradas + snapshots (meta/)
  src/
    db/              # schema Drizzle, conexão (pg Pool), seed
    lib/             # datetime, slots (disponibilidade), locks (advisory), errors, events
    plugins/         # auth (JWT)
    modules/         # 1 pasta por domínio: routes.ts + service.ts + schemas.ts
      auth/ establishment/ services/ products/ employees/ clients/
      appointments/ waitlist/ transactions/ recurringExpenses/
      dashboard/ reports/ commissions/ coupons/ loyalty/ points/
      public/ realtime/
    app.ts           # monta o Fastify e registra as rotas com seus prefixos
    server.ts env.ts
frontend/
  src/
    api/             # 1 arquivo por módulo, funções tipadas sobre fetch (api<T>)
    components/
      ui/            # kit próprio: Button, Input, Dialog, Table, Toast, Badge...
      layout/        # AppLayout (sidebar), AppHeader, NotificationsBell
      agenda/ booking/ settings/ marketing/ realtime/
    pages/
      auth/          # login + cadastro (wizard com quiz)
      panel/         # dashboard, agenda, clientes, estoque, fidelidade, financeiro, relatórios, configurações
      public/        # wizard público de agendamento (mobile-first)
    contexts/ hooks/ lib/ types/
```

**Padrão de módulo (backend):** cada domínio é um plugin Fastify (`routes.ts`) que aplica `app.addHook('preHandler', app.authenticate)` e delega para funções puras `(establishmentId, ...args)` em `service.ts`, com entrada validada por Zod em `schemas.ts`. Erros de domínio usam `AppError(msg, statusCode)`; erros de validação retornam `400` com `issues`.

**Multi-tenant:** o JWT carrega `{ sub: userId, establishmentId }`. Todo service filtra por `establishmentId`; não há dado cruzando estabelecimentos.

---

## Features do sistema

Navegação do painel (sidebar): **Principal** (Dashboard, Agenda) · **Gestão** (Clientes, Fidelidade, Estoque, Financeiro, Relatórios) · **Sistema** (Configurações).

### Agenda & Agendamentos
- Visão de agenda (dia/semana/mês) com colunas por profissional, cores por status do atendimento.
- Criação de agendamento pelo painel (walk-in, aceita horário passado) com criação/reuso automático de cliente por telefone.
- Estados do atendimento: `pending` → `confirmed` → `completed`, além de `cancelled`. Remarcar, cancelar, reabrir e restaurar.
- Cálculo de disponibilidade respeitando jornada do profissional, almoço, horário de funcionamento e bloqueios de agenda.
- Trava por advisory lock (profissional + dia) evita reservas sobrepostas em concorrência.
- **Fechamento do serviço (checkout):** formas de pagamento (dinheiro, PIX, débito, crédito parcelado), venda de **produtos** e **serviços extras** avulsos, aplicação de **cupom** (código, campanha automática ou desconto manual). Aceita **gorjeta** (recebeu a mais) e **dívida** (recebeu a menos) por switch; a dívida vira saldo devedor do cliente, exibido no detalhe dele e opcionalmente cobrado num fechamento futuro. Ao concluir, gera receita no financeiro (pelo valor efetivamente recebido), apura comissão, baixa estoque e acumula fidelidade/pontos — tudo em uma transação, revertida ao reabrir.

### Clientes
- Cadastro por telefone (chave única por estabelecimento), com histórico de atendimentos, total gasto e última visita computados na hora.
- Página de detalhe com cupons pessoais, saldo de pontos e progresso do cartão fidelidade.

### Estoque (Produtos)
- CRUD de produtos com preço, custo, quantidade, marca/fornecedor, SKU e código de barras.
- Alertas de estoque baixo/esgotado nas notificações. Baixa automática na venda no checkout.

### Marketing / Fidelidade
Página dedicada com abas — o **cupom é o instrumento universal de desconto** (fidelidade e pontos "cunham" cupons pessoais):
- **Cupons:** códigos de desconto (`%`, valor fixo ou serviço grátis) com validade, gasto mínimo, teto de desconto, limite total e por cliente, escopo por serviço e opção "só primeira visita".
- **Campanhas:** descontos automáticos por condição (ex.: primeira visita) aplicados sozinhos no fechamento; quando várias casam, vale a de maior desconto (código digitado/desconto manual têm prioridade).
- **Cartão fidelidade:** a cada atendimento concluído acima de um ticket mínimo o cliente ganha 1 carimbo; ao juntar X carimbos resgata a recompensa (serviço grátis / `%` / valor fixo), que vira um cupom pessoal.
- **Pontos:** o dono define pontos por atendimento e/ou por valor gasto; um catálogo de níveis (X pontos = recompensa) permite resgatar um cupom pessoal.

No tipo **serviço grátis** (fidelidade e pontos), a recompensa pode valer para qualquer serviço ou ser restrita a um ou mais serviços elegíveis (`reward_service_ids`).

### Financeiro
- Livro-caixa (entradas/saídas) com filtros por período e tipo; entradas de atendimento aparecem vinculadas.
- **Comissões** apuradas por atendimento concluído (snapshot da regra), agregadas por profissional.
- **Custos fixos recorrentes** e **folha de pagamento** com previsão do mês e "dar baixa" (gera lançamento no caixa; passar o mouse no "Baixado" revela o "Desfazer").

### Relatórios & Dashboard
- Dashboard com métricas resumidas do estabelecimento.
- Relatórios de receita (por dia/mês), serviços mais vendidos e ocupação.

### Fila de espera
- Enfileirar cliente para um dia cheio e "encaixar" (promover) a entrada em agendamento quando abre vaga. Só no painel.

### Notificações (sino)
- Derivadas ao vivo do estado atual: agendamentos a aprovar, novos agendamentos (24h), atendimentos não fechados, fila de espera, aniversariantes, custos/folha a vencer e estoque baixo.

### Link público de agendamento
- Wizard mobile-first por `slug`: serviço → (profissional) → data → horário → dados do cliente → confirmação.
- Identificação de cliente recorrente por telefone (pré-preenche o nome).
- Branding por plano (cor/banner/mensagem no pago; marca Kairoon no Free), resolvido no servidor.
- Reservas do link aparecem no painel em tempo real (SSE) e podem exigir aprovação (conforme `autoConfirm`).

### Configurações
Abas: **Estabelecimento** (dados, CNPJ, endereço via ViaCEP, formas de pagamento), **Serviços** (inclui pacotes com desconto), **Funcionários** (jornada, comissões, folha), **Funcionamento** (horários por dia da semana), **Aparência** (branding do link público), **Plano** e **Conta**.

### Autenticação & Planos
- Cadastro do dono cria conta + estabelecimento + primeiro profissional; login retorna JWT (7 dias).
- Redefinição de senha por código enviado no e-mail (Resend), disparada pelo próprio usuário logado na aba **Conta**.
- Plano Free: 1 estabelecimento e 1 funcionário, aplicado por regra de negócio (`403` na API + tela de upgrade na UI).

---

## API — rotas

Base local: `http://localhost:3333`. Autenticação por **JWT Bearer** (`Authorization: Bearer <token>`). Rotas marcadas `(auth)` exigem token; `(público)` não. Dinheiro sempre em centavos; datas `YYYY-MM-DD`.

### Sistema
- `GET /health` — health check (público)

### Auth — `/auth`
- `POST /auth/register` — cria dono + estabelecimento; devolve token/usuário/estabelecimento (público)
- `POST /auth/login` — autentica; devolve token/usuário/estabelecimento (público)
- `GET /auth/slug-available?slug=` — disponibilidade de slug no cadastro; rate-limit 30/min (público)
- `GET /auth/me` — perfil do usuário atual (auth)
- `PUT /auth/me` — atualiza o perfil (auth)
- `POST /auth/password-reset/request` — envia um código de redefinição por e-mail; rate-limit 3/5min (auth)
- `POST /auth/password-reset/confirm` — confirma o código e define a nova senha; rate-limit 6/5min (auth)

### Estabelecimento — `/establishment` (auth)
- `GET /establishment` · `PUT /establishment` — obtém/atualiza o estabelecimento
- `PUT /establishment/slug` — atualiza o slug do link público
- `GET /establishment/slug-availability?slug=` — disponibilidade de slug (ignorando o próprio)
- `GET|PUT /establishment/working-hours` — horários de funcionamento
- `GET /establishment/time-blocks` · `POST /establishment/time-blocks` · `DELETE /establishment/time-blocks/:id` — bloqueios de agenda
- `GET /establishment/plan` — plano atual + limites/uso
- `DELETE /establishment` — exclui a conta

### Serviços — `/services` (auth)
- `GET /services` · `POST /services` · `PUT /services/:id` · `DELETE /services/:id`

### Produtos — `/products` (auth)
- `GET /products` · `POST /products` · `PUT /products/:id` · `DELETE /products/:id`

### Funcionários — `/employees` (auth)
- `GET /employees` · `POST /employees` · `PUT /employees/:id` · `DELETE /employees/:id`

### Clientes — `/clients` (auth)
- `GET /clients?search=` — lista (busca opcional)
- `GET /clients/:id` — detalhe + estatísticas + histórico
- `POST /clients` · `PUT /clients/:id`

### Agendamentos — `/appointments` (auth)
- `GET /appointments?start=&end=&employeeId=&status=` — lista por período (`start`/`end` obrigatórios)
- `GET /appointments/search?q=` — busca por termo
- `GET /appointments/recent?sinceHours=` — criados recentemente (1–168h, default 24)
- `GET /appointments/:id` — detalhe
- `POST /appointments` — cria (requer `clientId` ou `clientName`+`clientPhone`)
- `PATCH /appointments/:id` — status/remarcação e/ou fechamento (desconto, cupom, pagamentos, produtos, serviços extras)

### Fila de espera — `/waitlist` (auth)
- `GET /waitlist?status=&date=` · `POST /waitlist` · `POST /waitlist/:id/promote` · `DELETE /waitlist/:id`

### Transações — `/transactions` (auth)
- `GET /transactions?from=&to=&type=` · `POST /transactions` · `DELETE /transactions/:id`

### Custos fixos — `/recurring-expenses` (auth)
- `GET /recurring-expenses` · `GET /recurring-expenses/forecast?month=`
- `POST /recurring-expenses` · `PUT /recurring-expenses/:id` · `DELETE /recurring-expenses/:id`
- `POST /recurring-expenses/payroll/settle` — dá baixa na folha de um profissional (gera transação)
- `POST /recurring-expenses/:id/settle` — dá baixa em um custo fixo do mês (gera transação)

### Dashboard — `/dashboard` (auth)
- `GET /dashboard/summary` — métricas resumidas

### Relatórios — `/reports` (auth)
- `GET /reports/revenue?from=&to=&groupBy=` (`day`|`month`) · `GET /reports/top-services?from=&to=` · `GET /reports/occupancy?from=&to=`

### Comissões — `/commissions` (auth)
- `GET /commissions?from=&to=` — apuração por período

### Cupons — `/coupons` (auth)
- `GET /coupons?source=` (`manual`|`campaign`) · `POST /coupons` · `PUT /coupons/:id` · `DELETE /coupons/:id`
- `POST /coupons/validate` — valida/preview no checkout sem gravar
- `GET /coupons/clients/:clientId` — cupons disponíveis do cliente

### Fidelidade — `/loyalty` (auth)
- `GET /loyalty/program` · `PUT /loyalty/program` (upsert)
- `POST /loyalty/redeem` — resgata a recompensa do cartão (cunha cupom pessoal)
- `GET /loyalty/clients/:clientId` — status do cliente (carimbos/recompensa)

### Pontos — `/points` (auth)
- `GET /points/program` · `PUT /points/program` (upsert)
- `GET /points/rewards` · `POST /points/rewards` · `PUT /points/rewards/:id` · `DELETE /points/rewards/:id`
- `POST /points/redeem` — resgata um nível (cunha cupom pessoal)
- `GET /points/clients/:clientId` — saldo/status do cliente

### Público — `/public` (sem auth)
- `GET /public/:slug` — dados públicos do estabelecimento (branding por plano)
- `GET /public/:slug/availability?serviceId=&date=&employeeId=` — horários disponíveis
- `POST /public/:slug/identify` — identifica cliente recorrente por telefone; rate-limit 10/min
- `POST /public/:slug/appointments` — cria uma reserva self-service

### Tempo real — `/realtime`
- `GET /realtime/stream?token=` — stream SSE de eventos do estabelecimento (JWT no query param, validado no handler)

---

## Banco de dados

PostgreSQL via Drizzle ORM. Convenções gerais: PK `uuid` com `defaultRandom()`; timestamps `withTimezone` com `defaultNow()`; datas como `date {mode:'string'}` (`YYYY-MM-DD`) e horários como `text` (`HH:mm`); dinheiro em `integer` com sufixo `Cents`; porcentagem como `integer` 0–100 com coluna irmã `...Type`. Toda tabela de domínio referencia `establishments.id` com `onDelete: 'cascade'`.

### Enums
`appointment_status` (`confirmed`/`cancelled`/`completed`/`pending`) · `created_via` (`panel`/`public`) · `transaction_type` (`income`/`expense`) · `waitlist_status` (`waiting`/`scheduled`) · `coupon_source` (`manual`/`campaign`/`loyalty`/`points`) · `coupon_discount_type` (`percent`/`fixed`/`free_service`) · `coupon_applies_to` (`total`/`service`) · `loyalty_reward_type` (`free_service`/`percent`/`fixed`) · `points_entry_type` (`earn`/`redeem`)

### Tabelas

| Tabela | Papel |
| --- | --- |
| `users` | conta do dono (login): nome, email único, hash da senha, dados pessoais, campos de redefinição de senha (hash do código + validade) |
| `establishments` | raiz do tenant: nome, `slug` único, branding, `plan`, formas de pagamento (jsonb), `autoConfirm`, endereço/CNPJ |
| `working_hours` | horário de funcionamento por dia da semana (0–6), único por (estabelecimento, dia) |
| `services` | serviços: duração, `priceCents`, ativo; **pacotes** (`isPackage` + `packageServiceIds` + desconto) |
| `employees` | profissionais: jornada (entrada/saída/almoço/dias), comissão, dados de folha (salário, VR/VT/VA, bônus, dias de pagamento) |
| `employee_commissions` | regra de comissão por (profissional, serviço) — `%` ou centavos |
| `products` | estoque: preço/custo, quantidade, marca/fornecedor, SKU, código de barras |
| `time_blocks` | bloqueios de agenda (feriados/folgas/intervalos) |
| `clients` | clientes: nome, telefone (único por estabelecimento), email, nascimento, gênero |
| `appointments` | agendamentos: cliente/serviço/profissional, data/horário, status, `createdVia`, e o fechamento (`discountCents`, `payments`, `saleProducts`, `saleServices`) |
| `waitlist_entries` | fila de espera com `status` e vínculo ao agendamento promovido |
| `transactions` | livro-caixa: `income`/`expense`, vínculo opcional a agendamento, custo fixo ou folha |
| `recurring_expenses` | custos fixos mensais (valor, dia de vencimento) |
| `commission_entries` | comissão apurada por atendimento (snapshot da regra + valor), 1 por agendamento |
| `coupons` | definição de cupom/campanha: tipo/valor do desconto, escopo, validade, limites, `autoApply`, `source`, `clientId` (pessoal) |
| `coupon_redemptions` | ledger de uso do cupom (1 por agendamento; estorno = delete por `appointmentId`) |
| `loyalty_programs` | config do cartão fidelidade (carimbos necessários, ticket mínimo, recompensa; `reward_service_ids` p/ o serviço grátis) — 1 por estabelecimento |
| `loyalty_stamps` | ledger de carimbos (1 por atendimento; `redemptionId` = consumido) |
| `loyalty_redemptions` | concessão da recompensa do cartão (snapshot + cupom cunhado) |
| `points_programs` | config do programa de pontos (por serviço + por valor gasto) — 1 por estabelecimento |
| `points_rewards` | catálogo de níveis (X pontos = recompensa; `reward_service_ids` p/ o serviço grátis) |
| `points_entries` | ledger de pontos (`earn`/`redeem`); saldo = `sum(points)` por cliente |

**Padrão de acúmulo/estorno:** `commission_entries`, `coupon_redemptions`, `loyalty_stamps` e `points_entries` são ledgers chaveados por `appointmentId` (índice único). Concluir um atendimento insere as linhas; reabrir/cancelar as remove (delete por `appointmentId`) — tudo dentro da transação do fechamento. Fidelidade e pontos acumulam sobre o valor **realmente pago** (`finalCents`), não sobre o preço bruto.

---

## Migrations

Fluxo Drizzle Kit (config em `backend/drizzle.config.ts`, dialeto `postgresql`, saída em `backend/drizzle/`):

1. Edite `backend/src/db/schema.ts`.
2. `npm run db:generate` — diffa o schema contra os snapshots e emite um novo `.sql` em `backend/drizzle/` (statements separados por `--> statement-breakpoint`), atualizando `drizzle/meta/`.
3. `npm run db:migrate` — aplica as migrations pendentes.

As migrations são **geradas** (não escritas à mão) e versionadas em `backend/drizzle/` (`0000` … em diante), com snapshots em `drizzle/meta/*.json` e a ordem em `drizzle/meta/_journal.json`. As migrations mais recentes adicionaram a redefinição de senha (colunas em `users`) e trocaram a recompensa de serviço único (`reward_service_id`) pela lista de serviços elegíveis (`reward_service_ids`, jsonb) na fidelidade e nos pontos.

> ⚠️ **Ordem dos timestamps.** O drizzle-orm decide o que aplicar comparando **apenas** o `when` (timestamp) da migration com o mais recente já registrado no banco — não por hash/tag individual. Ao renumerar ou reordenar migrations (ex.: para resolver colisão de numeração entre branches), garanta que os `when` fiquem em ordem crescente; uma migration com `when` menor que o topo já aplicado é **pulada silenciosamente**, sem erro.

Deploy: o `backend/docker-entrypoint.sh` roda `db:create` + `db:migrate` (com retry) no start do container, antes de subir a API.

---

## Convenções importantes

- **Dinheiro em centavos** (`priceCents`, `amountCents`, `discountCents`) — formatação só na borda da UI (`formatBRL`/`parseBRLToCents`).
- **Datas `'YYYY-MM-DD'` e horários `'HH:mm'`** (strings, fuso local) — nunca `new Date('YYYY-MM-DD')`, que desloca o dia em fusos negativos; comparação lexicográfica direta.
- **Porcentagem** como inteiro 0–100 com coluna irmã `...Type: 'percent'|'fixed'`; math `Math.round((base*value)/100)`.
- **Design tokens** centralizados em `frontend/tailwind.config.ts` (cores, fontes Inter/Plus Jakarta Sans, sombras); regras de uso em `frontend/DESIGN.md`.
- **Atendimento concluído** gera transação de entrada, apura comissão, baixa estoque e acumula fidelidade/pontos numa única transação — o estorno (reabrir/cancelar) desfaz tudo.
- **Concorrência** protegida por advisory locks (`lib/locks.ts`): profissional+dia (agenda), cupom e cliente (resgates), evitando duplo-agendamento e duplo-resgate.
- **Agenda do painel** faz polling (15s) e recebe eventos SSE — reservas do link público aparecem sozinhas.
