# Plano — Sistema de Marketing/Fidelidade (Cupons, Campanhas, Cartão de Fidelidade e Pontos)

## Contexto

O Kairoon (SaaS de agendamento para salões) hoje **não tem nenhuma noção de cupom, campanha, fidelidade, pontos, recompensa ou cashback**. Este documento planeja quatro subsistemas de marketing para reter e atrair clientes:

1. **Cupons de desconto** — o dono cria cupons (código, `%` ou valor fixo).
2. **Campanhas** — descontos automáticos por condição (ex.: "primeiro cliente ganha X% ou R$ Y").
3. **Cartão de fidelidade** — a cada atendimento acima de um valor Y o cliente ganha um "carimbo"; ao juntar X carimbos ganha um serviço grátis (qualquer ou pré-escolhido) OU um desconto no próximo (`%`/fixo).
4. **Programa de pontos** — o dono define quantos pontos cada coisa vale (por serviço e/ou por valor gasto); ao atingir um limiar o cliente resgata uma recompensa (um cupom), com vários níveis.

O objetivo é aumentar a recorrência e dar ao dono ferramentas de promoção — reaproveitando ao máximo o que já existe.

**Fatos-chave do código atual** (fundam todo o plano):
- **Ponto de acúmulo único:** [backend/src/modules/appointments/service.ts](backend/src/modules/appointments/service.ts) `updateAppointment()` — quando o status vira `'completed'`, dentro de **uma** `db.transaction`, calcula `finalCents = max(0, service.priceCents + produtos − discountCents)`, baixa estoque, insere uma receita em `transactions` e um snapshot em `commission_entries`. Ao reabrir/cancelar, **estorna tudo** (delete por `appointmentId` + no-insert). É aqui que o acúmulo de carimbos/pontos e o resgate de cupom devem entrar, espelhando o bloco de comissão (`updateAppointment`, ~linhas 450–508).
- **Desconto já plumbado, mas sem UI:** `appointments.discountCents` (integer, default 0) já flui para `finalCents` e para a receita. O frontend fixa `const discountCents = 0` com comentário "tratado depois" em [AppointmentDetailsDialog.tsx:417](frontend/src/components/agenda/AppointmentDetailsDialog.tsx#L417). Este é o gancho natural de aplicação de desconto.
- **Convenções:** dinheiro sempre em centavos (`integer`, sufixo `Cents`); porcentagem como `integer` 0–100 com coluna irmã `...Type: 'percent'|'fixed'` (precedente: `services.packageDiscountType`, `employees.commissionType`); math `Math.round((base*value)/100)`. Multi-tenant por `establishmentId uuid NOT NULL references(() => establishments.id, {onDelete:'cascade'})` vindo do JWT. Datas são strings `'YYYY-MM-DD'` (comparação lexicográfica). Módulo = `modules/<nome>/{routes,service,schemas}.ts`, Fastify plugin com `app.addHook('preHandler', app.authenticate)`, registrado em [backend/src/app.ts](backend/src/app.ts). Migração: editar [schema.ts](backend/src/db/schema.ts) → `npm run db:generate` → `npm run db:migrate`.

**Decisões de produto:**
- **Acesso:** liberado para **todos os planos agora**, mas com o gate de plano **pré-fabricado e desligado** para ligar no futuro (uma constante).
- **Aplicação:** **só no painel** (checkout). O link público de agendamento **não** é tocado nesta entrega.
- **Área admin:** **página dedicada "Fidelidade"** no menu lateral, com abas internas.
- **Entrega:** **4 fases**, começando por Cupons.

---

## Princípio de arquitetura (o que amarra tudo)

**O cupom é o instrumento universal de desconto.** Tudo que concede desconto vira um cupom que resolve em `appointments.discountCents` no checkout:

- **Cupom manual** = código reutilizável que o dono cria e divulga.
- **Campanha** = um cupom com `autoApply=true`, `code=null`, `source='campaign'` e condições (`firstVisitOnly`, `minSpendCents`, validade). **Não há tabela separada de campanhas.**
- **Recompensa de fidelidade** e **resgate de pontos** = motores de *elegibilidade* cujo **output é um cupom pessoal, de uso único** (`clientId` preenchido, `maxUses=1`).

Assim existe **um só caminho** de validação, aplicação e estorno de desconto. Fidelidade e pontos **não** são "outro tipo de desconto no checkout" — são ledgers de acúmulo que cunham cupom.

**Serviço grátis como cupom:** `discountType='free_service'` + `appliesTo='service'` → `discountCents = preço do serviço do atendimento` (nunca produtos). `appliesTo` (`'total'|'service'`) cobre desconto no ticket inteiro vs. só na linha do serviço, sem casos especiais.

**Não empilha:** um cupom por atendimento (`uniqueIndex` em `coupon_redemptions.appointmentId`). Código digitado vence; senão, a melhor campanha `autoApply` que casar.

**Base de acúmulo:** carimbos e pontos acumulam sobre `finalCents` (valor **realmente pago**), **não** sobre `service.priceCents` bruto nem sobre o `totalSpentCents` bruto computado em [clients/service.ts](backend/src/modules/clients/service.ts) — este último **não deve ser reusado** para limiares.

---

## Modelo de dados (todas as tabelas novas em [schema.ts](backend/src/db/schema.ts))

Seguir o estilo do arquivo: enums no topo, `id uuid pk defaultRandom()`, `establishmentId` FK cascade, cents `integer`, `date {mode:'string'}`, índices no 2º arg do `pgTable`, `relations(...)` declaradas à parte (e uma entrada `many()` em `establishmentsRelations`).

**Enums:**
`coupon_discount_type` `['percent','fixed','free_service']` · `coupon_source` `['manual','campaign','loyalty','points']` · `coupon_applies_to` `['total','service']` · `loyalty_reward_type` `['free_service','percent','fixed']` · `points_entry_type` `['earn','redeem']`

**`coupons`** (definição/regra — serve manual e campanha):
`code text` (null p/ campanha e cupom cunhado) · `source` · `discountType` · `discountValue integer` (0–100 | centavos | ignorado p/ free_service) · `appliesTo default 'total'` · `appliesToServiceIds jsonb string[]` (null/vazio = qualquer serviço) · `minSpendCents integer default 0` · `maxDiscountCents integer` (teto opcional p/ percent/free_service) · `validFrom`/`validUntil date` (nullable) · `maxUses integer` (null = ilimitado) · `usesPerClient integer default 1` · `firstVisitOnly boolean default false` · `autoApply boolean default false` · `clientId uuid → clients cascade` (nullable; preenchido = pessoal) · `active boolean default true`.
Índices: `uniqueIndex(establishmentId, code)` (Postgres mantém múltiplos NULL distintos — códigos únicos por estabelecimento, cunhados sem colisão); `index(establishmentId, clientId)`; `index(establishmentId, active, autoApply)`.

**`coupon_redemptions`** (ledger de uso): `couponId uuid → coupons {onDelete:'restrict'}` · `clientId cascade` · `appointmentId cascade` · `discountCents integer` (snapshot).
Índices: `uniqueIndex(appointmentId)` (1 cupom/atendimento → estorno = delete por appointmentId, igual a comissão); `index(couponId)`; `index(couponId, clientId)`.

**`loyalty_programs`** (config, 1 por estabelecimento): `active boolean default false` · `stampsRequired integer default 10` · `minTicketCents integer default 0` (cada atendimento precisa `finalCents ≥` isso p/ carimbar) · `rewardType loyalty_reward_type` · `rewardValue integer` · `rewardServiceId uuid → services {onDelete:'set null'}` (null = qualquer serviço). `uniqueIndex(establishmentId)`.

**`loyalty_stamps`** (ledger de carimbos, 1 linha/carimbo): `clientId cascade` · `appointmentId cascade` · `redemptionId uuid → loyalty_redemptions {onDelete:'set null'}` (null = disponível; preenchido = consumido).
Índices: `uniqueIndex(appointmentId)`; `index(establishmentId, clientId)`. **Carimbos disponíveis = `count(*) where clientId=? and redemptionId is null`.**

**`loyalty_redemptions`** (concessão da recompensa): `clientId cascade` · `stampsSpent integer` (snapshot) · `couponId uuid → coupons {onDelete:'set null'}` (cupom cunhado) · `rewardType`/`rewardValue`/`rewardServiceId` (snapshot da regra).

**`points_programs`** (config, 1 por estabelecimento): `active boolean default false` · `pointsPerService integer default 0` (pontos fixos por atendimento) · `pointsPerCurrencyUnit integer default 0` (pontos por R$1 → `floor(finalCents/100) * isso`). `uniqueIndex(establishmentId)`.

**`points_rewards`** (catálogo de níveis): `name text` · `costPoints integer` (limiar) · `rewardType coupon_discount_type` · `rewardValue integer` · `rewardServiceId uuid → services {onDelete:'set null'}` · `active boolean default true`. `index(establishmentId, active)`.

**`points_entries`** (ledger de pontos): `appointmentId uuid → appointments cascade` (preenchido p/ 'earn'; null p/ 'redeem') · `rewardId uuid → points_rewards {onDelete:'set null'}` · `type points_entry_type` · `points integer` (positivo earn, negativo redeem) · `couponId uuid → coupons {onDelete:'set null'}`.
Índices: `uniqueIndex(appointmentId)` (1 earn/atendimento; redeem tem appointmentId null → múltiplos ok); `index(establishmentId, clientId)`. **Saldo = `coalesce(sum(points),0) where clientId=?`.**

**Por que ledger e não contador:** o requisito de estorno-ao-reabrir. Como cada linha de acúmulo é chaveada por `appointmentId` único, o estorno é o mesmo `delete by appointmentId` que `commission_entries` já usa; um contador desnormalizado poderia divergir no ciclo reabrir/refinalizar. Nada de saldo desnormalizado em `clients` (mantém a convenção de agregar por SQL na leitura).

---

## Integração no backend

### Acúmulo + estorno em `updateAppointment` (o gargalo)
Adicionar dois blocos dentro da `db.transaction` existente, logo **após** o bloco de comissão (~linha 508). `appointment.clientId`, `finalCents` e `newStatus` já estão em escopo. Padrão idêntico ao de comissão — **delete no topo (incondicional), insert só se `completed`**:

- **Carimbo:** se vai deixar de estar `completed` e o carimbo daquele atendimento já foi **consumido** (`redemptionId is not null`) → `throw AppError('Não é possível reabrir: este atendimento gerou um carimbo já resgatado', 409)` (espelha o `throw` de estoque insuficiente). Senão `delete loyalty_stamps where appointmentId`; se `completed` e programa ativo e `finalCents ≥ minTicketCents` → insere 1 carimbo.
- **Pontos:** `delete points_entries where appointmentId and type='earn'`. Se vai sair de `completed`, recomputar saldo **após** o delete; se `< 0` → `throw 409` ('cliente já resgatou esses pontos'). Se `completed` e programa ativo → `earned = pointsPerService + floor(finalCents/100)*pointsPerCurrencyUnit`; insere se `> 0`.

Sem checagem de plano no hot path: no plano grátis (quando o gate estiver ligado) simplesmente não existe programa/cupom ativo, então o acúmulo já no-opa.

### Aplicação de cupom no checkout (resgate atômico)
Estender `updateAppointmentSchema` ([appointments/schemas.ts](backend/src/modules/appointments/schemas.ts)) com `couponCode: z.string().trim().min(1).optional()`. Ao completar, **antes** do cálculo de `discountToStore`:
1. `delete coupon_redemptions where appointmentId` (estorno + refinalizar).
2. Se `couponCode` presente → resolve por `(establishmentId, code)`. Senão → varre campanhas `active + autoApply` que casam e escolhe a de maior `discountCents`.
3. Validar (`resolveAndValidateCoupon`): `active`; `validFrom ≤ appointment.date ≤ validUntil` (compara string `'YYYY-MM-DD'`); `subtotal ≥ minSpendCents`; `firstVisitOnly` → 0 atendimentos `completed` anteriores do cliente (excluindo este); `appliesToServiceIds` vazio ou inclui `serviceId`; caps global (`maxUses`) e por cliente (`usesPerClient`) contando `coupon_redemptions`.
4. `discountCents = min(computado, base, maxDiscountCents ?? ∞)`, `base = appliesTo==='service' ? service.priceCents : subtotal`; `free_service` → `base = service.priceCents`.
5. **`discountToStore = discountCents`** (cupom é a fonte da verdade). O guard `discountToStore > subtotal` e o recálculo de `finalCents` seguem inalterados. O desconto **manual** (dono digita, sem cupom) continua funcionando como hoje.
6. Insere `coupon_redemptions`.

**Guarda de duplo-resgate:** `lockCoupon(tx, couponId)` novo em [lib/locks.ts](backend/src/lib/locks.ts) (`pg_advisory_xact_lock(hashtext(couponId))`), adquirido **depois** do `lockEmployeeDay` já existente (manter a ordem p/ evitar deadlock), e recontar usos dentro da tx. O `uniqueIndex(coupon_redemptions.appointmentId)` bloqueia insert duplo no mesmo atendimento.

### Módulos novos e endpoints
Três módulos no padrão `{routes,service,schemas}`, `authenticate` no preHandler, registrados em [app.ts](backend/src/app.ts) com prefixos `/coupons`, `/loyalty`, `/points`. As funções puras (`resolveAndValidateCoupon`, `applyCoupon`, `accrueLoyalty`, `accruePoints`) ficam nos services novos e são **importadas** por `appointments/service.ts` (que já tem ~510 linhas — não inchar).

- **coupons:** `GET /` (`?source=manual|campaign`), `POST /`, `PUT /:id`, `DELETE /:id` (soft-delete → `active=false` quando há resgates), `POST /validate` (preview p/ o checkout, sem gravar), `GET /clients/:clientId` (cupons pessoais disponíveis).
- **loyalty:** `GET /program`, `PUT /program` (upsert), `POST /redeem {clientId}` (valida disponíveis ≥ required, cunha cupom `source='loyalty'`, insere `loyalty_redemptions`, marca os carimbos consumidos), `GET /clients/:clientId`.
- **points:** `GET /program`, `PUT /program`, CRUD `/rewards`, `POST /redeem {clientId, rewardId}` (valida saldo ≥ costPoints, insere entry `−costPoints`, cunha cupom `source='points'`), `GET /clients/:clientId`.

Endpoints de `redeem` envolvem `db.transaction` + `lockClientLoyalty(tx, clientId)` (advisory lock novo) e recheca disponível/saldo antes de cunhar.

### Gate de plano — pré-fabricado e desligado
Criar [backend/src/lib/plan.ts](backend/src/lib/plan.ts) com `assertPaidPlan(establishmentId)` (lê `establishments.plan`, lança `AppError('Disponível no plano Pro', 403)` se `'free'`) **atrás de uma constante** `export const MARKETING_REQUIRES_PRO = false`. Chamar `if (MARKETING_REQUIRES_PRO) await assertPaidPlan(...)` em todo create/update dos três módulos. Ligar no futuro = trocar a constante para `true`. (Espelha o padrão de write-gate de `updateEstablishment`.)

---

## Frontend

**Página dedicada** `frontend/src/pages/panel/MarketingPage.tsx` na rota `/app/fidelidade`:
- Registrar rota em [App.tsx](frontend/src/App.tsx) e item no `NAV_GROUPS` (grupo **Gestão**, label "Fidelidade", ícone `Gift`/`Sparkles`) em [AppLayout.tsx](frontend/src/components/layout/AppLayout.tsx).
- Navegação interna com o `Tabs` existente + `?tab=` (igual a [SettingsPage.tsx](frontend/src/pages/panel/SettingsPage.tsx)): **Cupons · Campanhas · Cartão fidelidade · Pontos**.
- Componentes de aba em `frontend/src/components/marketing/`: `CouponsTab.tsx`, `CampaignsTab.tsx`, `LoyaltyCardTab.tsx`, `PointsTab.tsx`, seguindo o padrão CRUD-com-Dialog de `EmployeesTab`/`ServicesTab`.
- **Reusar as primitivas existentes** ([components/ui/](frontend/src/components/ui/)): `Card`, `Table`, `Dialog`/`DialogActions`, `Input` (com `leftIcon`), `Select`, `Switch`, `Badge`, `ConfirmDialog`, `EmptyState`, `PageHeader`, `Tabs`, `Button`, `useToast`. Dinheiro via `formatBRL`/`parseBRLToCents` de [lib/format.ts](frontend/src/lib/format.ts).
- Camada de API nova: `frontend/src/api/{coupons,loyalty,points}.ts` (planos, chamando `api<T>`). Tipos em [types/api.ts](frontend/src/types/api.ts) no precedente de `PackageDiscountType`: `Coupon`, `CouponDiscountType`, `CouponSource`, `CouponAppliesTo`, `LoyaltyProgram`, `LoyaltyStampSummary`, `PointsProgram`, `PointsReward`, `PointsBalance`.

**Checkout** ([AppointmentDetailsDialog.tsx](frontend/src/components/agenda/AppointmentDetailsDialog.tsx), componente `PaymentCheckout`): trocar o `const discountCents = 0` (linha 417) por estado real:
- Campo de cupom (`Input` com ícone `Ticket` + botão "Aplicar") e um campo "Desconto manual". Aplicar código chama `POST /coupons/validate {code, serviceId, subtotalCents, clientId}` → seta `appliedCoupon` + `discountCents`. A linha "Desconto" do resumo (hoje sempre "—", linhas 553–558) acende sozinha, e o `useEffect([finalCents, selected])` já re-sincroniza a forma de pagamento única.
- `onConfirm` ganha `couponCode`; a mutation envia `updateAppointment({status:'completed', discountCents, couponCode, payments, saleProducts})`. Estender `UpdateAppointmentPayload` em [api/appointments.ts](frontend/src/api/appointments.ts).
- Fases 3/4: ao abrir o dialog, buscar resumo de carimbos/pontos/cupons do cliente e mostrar um banner de elegibilidade ("8/10 carimbos · 240 pontos · 1 cupom disponível") com aplicar-em-um-toque.

**Detalhe do cliente** ([ClientDetailPage.tsx](frontend/src/pages/panel/ClientDetailPage.tsx)): ao lado dos `StatCard`s, adicionar (leitura) progresso de carimbos ("8 / 10" + botão "Resgatar" quando pronto), `StatCard` de saldo de pontos + lista de recompensas resgatáveis, e lista de cupons ativos (código/desconto/validade). Queries novas `['loyalty','client',id]`, `['points','client',id]`, `['coupons','client',id]`.

---

## Fases de entrega (cada uma utilizável sozinha)

Para minimizar migrações, **criar todas as colunas de `coupons` já na Fase 1** (incl. `autoApply`, `firstVisitOnly`, `appliesTo`, `minSpendCents`, `valid*`, `maxDiscountCents`), tornando a Fase 2 só código. Total: **3 migrações** (Fase 1 cupons, Fase 3 fidelidade, Fase 4 pontos).

### Fase 1 — Núcleo de cupons + resgate no checkout + desbloqueio do desconto
Maior valor/esforço; também conserta o `discountCents=0` histórico.
- **Backend:** `schema.ts` (+`coupons`, `coupon_redemptions`, 3 enums); `modules/coupons/*` (CRUD manual + `POST /validate`); `lib/locks.ts` (+`lockCoupon`); `lib/plan.ts` (novo, gate desligado); `appointments/service.ts` (bloco aplicar/estornar cupom) + `appointments/schemas.ts` (+`couponCode`); `app.ts` (registra `/coupons`).
- **Frontend:** `types/api.ts` (tipos de Coupon); `api/coupons.ts`; `api/appointments.ts` (+`couponCode`); `MarketingPage.tsx` + `components/marketing/CouponsTab.tsx`; `AppointmentDetailsDialog.tsx` (desconto real + inputs); `App.tsx` + `AppLayout.tsx` (rota + nav).

### Fase 2 — Campanhas (primeiro cliente automático)
Só código, reusa `coupons`.
- **Backend:** `coupons/service.ts` (varredura auto-apply: casa campanhas, `firstVisitOnly`, melhor desconto, grava resgate).
- **Frontend:** `components/marketing/CampaignsTab.tsx` (CRUD sobre `source='campaign'`); `AppointmentDetailsDialog.tsx` (mostra desconto de campanha auto-aplicado, read-only).

### Fase 3 — Cartão de fidelidade
- **Backend:** `schema.ts` (+`loyalty_programs`, `loyalty_stamps`, `loyalty_redemptions`, enum); `modules/loyalty/*`; `appointments/service.ts` (acúmulo/estorno de carimbo + guarda de consumido); `lib/locks.ts` (+`lockClientLoyalty`); `app.ts`.
- **Frontend:** `api/loyalty.ts` + tipos; `components/marketing/LoyaltyCardTab.tsx`; `ClientDetailPage.tsx` (progresso + resgate); `AppointmentDetailsDialog.tsx` (aplicar cupom de fidelidade cunhado).

### Fase 4 — Programa de pontos
- **Backend:** `schema.ts` (+`points_programs`, `points_rewards`, `points_entries`, enum); `modules/points/*` (config + catálogo + `POST /redeem`); `appointments/service.ts` (acúmulo/estorno de pontos + guarda de saldo negativo); `app.ts`.
- **Frontend:** `api/points.ts` + tipos; `components/marketing/PointsTab.tsx` (config + catálogo); `ClientDetailPage.tsx` (saldo + resgate).

### Fase 5 (adiada/opcional)
Cupom no link público de agendamento; campanhas por aniversário/N-ésima visita; dashboard de uso/resgates; e ligar o gate `MARKETING_REQUIRES_PRO`.

---

## Riscos e casos de borda

- **Estorno ao reabrir/cancelar:** cada motor chaveia o acúmulo em `appointmentId` único → estorno é o mesmo `delete by appointmentId` da comissão; refinalizar com cupom diferente = delete + recomputa. Deletes no topo do bloco, insert só se `completed`.
- **Recompensa já consumida:** reabrir atendimento cujo carimbo/ponto já financiou um resgate → `throw 409` ('já resgatou'), consistente com o `throw` de estoque. Carimbo: detecta `redemptionId is not null`; pontos: recomputa saldo pós-delete e bloqueia se `< 0`.
- **Duplo-resgate de cupom:** `uniqueIndex(coupon_redemptions.appointmentId)` + `lockCoupon` + recontagem em tx; cupom pessoal `maxUses=1`. Resgate de recompensa: `lockClientLoyalty(clientId)` + recheca antes de cunhar.
- **Cupom + pacote:** pacote é `services` com desconto já embutido no `priceCents`; o cupom aplica por cima, agnóstico. Proteger "serviço grátis" caro com `appliesToServiceIds` e `maxDiscountCents`.
- **Desconto > subtotal:** já guardado no servidor; além disso `discountCents = min(computado, base, maxDiscountCents)`.
- **Serviço grátis em serviço diferente:** validação rejeita quando `appliesToServiceIds` não-vazio não inclui o `serviceId`.
- **Validade/data:** comparar `validFrom/validUntil` com `appointment.date` (não `today`, p/ honrar walk-in retroativo), string `'YYYY-MM-DD'`. Nunca `new Date('YYYY-MM-DD')`. Math sempre inteiro.
- **Bruto vs. pago:** limiares usam `finalCents`; **não** reusar o `totalSpentCents` bruto de `clients/service.ts`.
- **Edição de config após acúmulo:** ledgers são históricos (pontos snapshotados por entry; carimbos são unidades). Mudar `stampsRequired`/`costPoints` afeta o limiar de resgate imediatamente (lido ao vivo) — aceitável, sinalizar em uma linha na UI.
- **Exclusão com histórico:** `coupon_redemptions.couponId` é `restrict` → excluir cupom com resgates faz soft-delete (`active=false`). Excluir cliente cascateia seus cupons/carimbos/pontos. Excluir serviço zera `rewardServiceId`; ids órfãos em `appliesToServiceIds` simplesmente deixam de casar (cupom fica inutilizável) — aceitável.

---

## Verificação (end-to-end, por fase)

Rodar backend e frontend (`package.json`: backend `tsx watch src/server.ts`, frontend Vite) e, a cada fase, após `npm run db:generate` + `npm run db:migrate`:

1. **Fase 1:** criar um cupom `10%` (e um `R$ Y` fixo) em Fidelidade → Cupons. Abrir um agendamento, concluir aplicando o código; conferir que o resumo mostra o desconto, que `finalCents` cai e que a receita em Financeiro reflete o valor com desconto. Reabrir o atendimento e confirmar que o resgate é estornado (linha some de `coupon_redemptions`, receita volta ao cheio). Tentar reusar cupom `maxUses=1` → recusado.
2. **Fase 2:** criar campanha "primeiro cliente 20%" `autoApply`. Concluir o **primeiro** atendimento de um cliente novo sem digitar código → desconto aplicado automaticamente; concluir um segundo atendimento do mesmo cliente → campanha não aplica.
3. **Fase 3:** configurar cartão (ex.: 5 carimbos, ticket mín. R$ 30, recompensa serviço grátis). Concluir 5 atendimentos elegíveis de um cliente → em ClientDetail aparece 5/5 e "Resgatar" → resgatar cunha cupom de serviço grátis, carimbos ficam consumidos. Reabrir um dos 5 já resgatados → bloqueado com 409.
4. **Fase 4:** configurar pontos (ex.: 1 ponto/R$1 + 10 por serviço) e um nível "300 pts = R$ 20". Concluir atendimentos, ver saldo subir em ClientDetail; resgatar o nível → saldo debita e cupom é cunhado; aplicar esse cupom no próximo checkout.

Checar `tsc --noEmit` (frontend) e o typecheck do backend antes de cada commit. Testar concorrência não é trivial manualmente — confiar nos advisory locks + unique indexes, e validar o caminho feliz + os 409 de estorno.

> **Nota sobre o gate de plano:** nasce desligado (`MARKETING_REQUIRES_PRO=false`); quando a cobrança existir, trocar para `true` e adicionar o estado bloqueado + CTA "Conhecer planos" na `MarketingPage` (padrão de [AppearanceTab.tsx](frontend/src/components/settings/AppearanceTab.tsx)).
