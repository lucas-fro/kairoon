# Relatório de Segurança — Kairoon

> Auditoria de segurança do backend (Fastify/Drizzle/PostgreSQL) e frontend (React/Vite) do Kairoon.
> Metodologia: análise estática multi-agente do código-fonte com verificação adversarial de cada achado (confirmação lendo o código real + prova de conceito). Nenhum teste dinâmico/DAST foi executado contra um ambiente rodando.
>
> **Data:** 2026-07-04 · **Escopo:** commit inicial · **Analista:** revisão automatizada assistida (Claude)

---

## 1. Sumário executivo

O Kairoon é um MVP freemium **bem construído no que mais importa**: o isolamento multi-tenant é consistente (toda query filtra por `establishment_id` derivado do **token**, nunca do corpo da requisição), não há SQL injection (tudo parametrizado via Drizzle), as senhas usam bcrypt, o preço do agendamento vem do banco (não do cliente) e há proteção correta contra condição de corrida de _double-booking_ via _advisory lock_. **Não foi encontrado nenhum IDOR nem vazamento de dados entre tenants.**

As fragilidades reais concentram-se em três frentes típicas de pré-produção:

1. **Falta de _rate-limiting_** — apenas 1 dos endpoints anônimos tem limite. Login, cadastro e criação de agendamento público estão totalmente abertos a força-bruta, spam e negação de serviço.
2. **Superfície pública anônima ampla** — o link de agendamento permite _flood_ da agenda, enumeração de clientes (PII) e **sobrescrita de dados de clientes existentes sem autenticação**.
3. **_Hardening_ ausente** — sem `helmet` (nenhum header de segurança), token JWT em `localStorage` (roubável por XSS) e sem revogação de sessão.

### Panorama dos achados (após deduplicação)

| Severidade | Qtde | Natureza |
|---|---|---|
| 🔴 **ALTA** | 4 | Força-bruta de login, spam/flood de agenda, sobrescrita de PII sem auth, roubo de token por XSS |
| 🟠 **MÉDIA** | 8 | Sem helmet, token em log, DoS de SSE, sem revogação de JWT, enumeração de PII, injeção de iCal, segredo no repo |
| 🟡 **BAIXA** | 7 | CORS do SSE, limite de plano no backend, sem paginação, fuso do servidor, `tsx` em produção |
| ⚪ **INFO** | 7 | _Defense-in-depth_: constraint de banco, allowlist de URL, custo do bcrypt, CI/testes, `npm audit` |

> **Veredito:** nenhuma vulnerabilidade permite hoje um atacante externo ler dados de outro estabelecimento. O risco imediato mais alto é **abuso da superfície pública** (força-bruta, spam de agenda, corrupção de PII) — tudo mitigável com _rate-limit_ + `helmet` + captcha, em poucos dias de trabalho.

---

## 2. O que já está bem feito (não mexer)

Estas defesas foram **verificadas positivamente** e devem ser preservadas:

- ✅ **Isolamento multi-tenant consistente.** Todo _service_ recebe `establishmentId` de `request.user.establishmentId` (o token JWT) e filtra `and(eq(tabela.id, id), eq(tabela.establishmentId, establishmentId))` em list/get/update/delete. Nenhuma rota autenticada usa um `id` cru do request sem o par de tenant. Sem IDOR.
- ✅ **Sem SQL injection.** Não há `sql.raw`/concatenação; o único `sql`` `` (advisory lock em [locks.ts](backend/src/lib/locks.ts)) e os fragmentos de agregação usam _bind params_ do Drizzle.
- ✅ **Preço vem do banco.** [public/service.ts](backend/src/modules/public/service.ts) busca o serviço via `findActiveService` — o cliente não consegue manipular `priceCents`.
- ✅ **_Double-booking_ tratado.** `pg_advisory_xact_lock` serializa reservas do mesmo profissional+dia dentro da transação, com revalidação de conflito ([appointments/service.ts:112](backend/src/modules/appointments/service.ts#L112), [public/service.ts:260](backend/src/modules/public/service.ts#L260)).
- ✅ **Sem _mass assignment_.** Os schemas Zod são objetos estritos (removem chaves desconhecidas); `updateEstablishment` com `.set(input)` **não** permite escalar `plan`/`ownerId`/`id`.
- ✅ **Login sem enumeração.** `authenticateOwner` devolve mensagem genérica (`E-mail ou senha incorretos`) tanto para e-mail inexistente quanto senha errada.
- ✅ **`JWT_SECRET` obrigatório.** [env.ts](backend/src/env.ts) exige mínimo de 20 caracteres e **não** tem default — a app falha ao subir sem ele.
- ✅ **Auth no backend, não só na UI.** `ProtectedRoute` é apenas guarda visual, mas toda rota privada tem `app.authenticate` no backend — _defense-in-depth_ confirmada.
- ✅ **Sem segredos no bundle.** Nenhuma chave embutida em `import.meta.env` e sem _source maps_ em produção.

---

## 3. Achados detalhados

Cada achado traz: evidência no código, impacto, prova de conceito (exploit) e correção. Referências de arquivo são clicáveis.

---

### 🔴 ALTA

#### SEC-01 — Login e cadastro sem _rate-limit_: força-bruta de senha e DoS de CPU
**Arquivo:** [auth/routes.ts:13](backend/src/modules/auth/routes.ts#L13) · **CWE-307**

O plugin de _rate-limit_ é registrado com `{ global: false }` ([app.ts:53](backend/src/app.ts#L53)) e o **único** endpoint com limite é `POST /public/:slug/identify`. `POST /auth/login` e `POST /auth/register` não têm nenhum controle.

```ts
app.post('/login', async (request) => {
  const input = loginSchema.parse(request.body)
  const { user, establishment } = await authService.authenticateOwner(input)
  const token = app.jwt.sign({ sub: user.id, establishmentId: establishment.id })
  return { token, user, establishment }
})   // <- sem preHandler, sem config.rateLimit
```

- **Impacto:** tentativas ilimitadas de credenciais contra qualquer dono de estabelecimento (a senha mínima no cadastro é apenas 6 caracteres). Além disso, cada tentativa executa `bcrypt.compare` (custo 10, deliberadamente caro) — milhares de logins concorrentes saturam CPU e _pool_ de conexões, degradando toda a API.
- **Exploit:** `for senha in wordlist: POST /auth/login {email: alvo, password: senha}`. Resposta 200 com token = acerto → controle total do tenant (JWT válido por 7 dias). Nenhum 429 é retornado.
- **Correção:** declarar `config.rateLimit` (ex.: 5–10/min por IP **e** por e-mail) em `/login` e `/register`; adicionar _backoff_/lockout após N falhas; aumentar o mínimo de senha; considerar captcha.

#### SEC-02 — `POST /public/:slug/appointments` sem _rate-limit_: spam de agenda e criação ilimitada de clientes
**Arquivo:** [public/routes.ts:34](backend/src/modules/public/routes.ts#L34) · **CWE-799 / CWE-770**

Endpoint anônimo, sem limite. Cada requisição válida insere um `appointment`, insere/atualiza um `client` novo por telefone e (se `autoConfirm=false`) dispara `publish()` para todas as conexões SSE do painel.

- **Impacto:** um atacante que descobre o `slug` (visível na URL do link público) pode: **(a)** ocupar todos os _slots_ reais da agenda com reservas falsas — negação de serviço de negócio; **(b)** inflar a tabela `clients` com milhares de cadastros fictícios; **(c)** _floodar_ o painel do dono com eventos em tempo real. A checagem de conflito bloqueia até status `pending` ([service.ts:270](backend/src/modules/public/service.ts#L270)), então mesmo reservas não confirmadas travam o horário.
- **Exploit:** enumerar _slots_ livres via `GET /:slug/availability` e, em loop, `POST /:slug/appointments` variando `phone` (10–13 dígitos) e `name` (mín. 2 chars). Sem barreira.
- **Correção:** `config.rateLimit` por IP **e** por telefone/slug; teto de pendentes por telefone; CAPTCHA (Turnstile/hCaptcha) ou verificação OTP do telefone antes de persistir.

#### SEC-04 — Link público sobrescreve PII de cliente existente sem autenticação
**Arquivo:** [public/service.ts:304](backend/src/modules/public/service.ts#L304) · **CWE-639**

Ao agendar, o cliente é resolvido **apenas pelo telefone** e, se já existe, o backend **sobrescreve** `email`/`birthDate`/`gender` com os valores do corpo — sem qualquer prova de posse do número.

```ts
} else {
  const patch: Partial<typeof clients.$inferInsert> = {}
  if (email && client.email !== email) patch.email = email       // sobrescreve, não preenche
  if (birthDate && client.birthDate !== birthDate) patch.birthDate = birthDate
  if (gender && client.gender !== gender) patch.gender = gender
  if (Object.keys(patch).length > 0) {
    await tx.update(clients).set(patch).where(eq(clients.id, client.id))
  }
}
```

- **Impacto:** quem conhece/adivinha o telefone de um cliente (enumerável via `/identify`) pode **sequestrar o e-mail** daquele cliente (canal de contato/marketing) e corromper data de nascimento e gênero de um registro que não lhe pertence. Combinado com SEC-02, corrupção em massa.
- **Correção:** em fluxo não autenticado, preencher **somente campos nulos** (`if (email && client.email == null) …`), nunca sobrescrever PII existente. Alteração de PII deve exigir OTP ou o painel autenticado.

#### SEC-05 — Token JWT em `localStorage` + ausência de CSP: qualquer XSS = _account takeover_ por 7 dias
**Arquivo:** [client.ts:16-26](frontend/src/api/client.ts#L16-L26) · **CWE-522 / CWE-79**

```ts
export function getToken() { return localStorage.getItem(TOKEN_KEY) }
export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token) }
```

- **Impacto:** o JWT fica em `localStorage`, legível por qualquer JavaScript. Como não há `helmet`/CSP (SEC-06), qualquer XSS (refletido ou armazenado) rouba o token, que é válido por 7 dias e não pode ser revogado (SEC-10) → tomada de conta completa.
- **Correção:** preferir cookie `httpOnly`+`Secure`+`SameSite` para o token; instalar `helmet` com CSP restritiva; reduzir expiração + _refresh token_ (SEC-10). Mesmo mantendo `localStorage`, CSP + revogação reduzem drasticamente a janela.

---

### 🟠 MÉDIA

#### SEC-06 — Ausência total de headers de segurança (sem `helmet`) e sem `bodyLimit` explícito
**Arquivo:** [app.ts:21-22](backend/src/app.ts#L21-L22) · **CWE-693**

O `package.json` só traz `@fastify/{cors,jwt,rate-limit}`. Nenhum CSP, HSTS, X-Frame-Options, X-Content-Type-Options ou Referrer-Policy é enviado.
- **Impacto:** _clickjacking_, MIME-sniffing, ausência de defesa contra XSS (agravando SEC-05) e vazamento via `Referer` (agravando SEC-07). O `bodyLimit` fica no default de 1 MB do Fastify — aceitável, mas convém fixar explicitamente nos endpoints anônimos.
- **Correção:** `app.register(helmet)` após o CORS; definir `bodyLimit` conservador.

#### SEC-07 — Token JWT trafega em _query string_ no SSE e vaza nos logs
**Arquivo:** [realtime/routes.ts:11](backend/src/modules/realtime/routes.ts#L11) · **CWE-598**

O `EventSource` não envia header `Authorization`, então o token vem em `?token=`. A app roda com `Fastify({ logger: true })` **sem `redact`**, e o _serializer_ padrão loga `req.url` inteiro.
- **Impacto:** o JWT (válido 7 dias) fica em texto claro nos logs do servidor e pode vazar via `Referer`/proxies. Quem lê os logs obtém um token totalmente válido.
- **Correção:** `logger: { redact: ['req.url', 'req.query.token'] }`; usar token efêmero/uso único dedicado ao SSE; idealmente cookie `httpOnly`.

#### SEC-08 — Conexões SSE ilimitadas: exaustão de memória/_file descriptors_
**Arquivo:** [realtime/routes.ts:31](backend/src/modules/realtime/routes.ts#L31) · **CWE-770**

Não há teto de conexões SSE por token, tenant ou global, e a rota não tem _rate-limit_. Cada conexão mantém um socket, um handler no `Set` em memória e um `setInterval`.
- **Impacto:** com um único token válido, milhares de `EventSource` concorrentes esgotam memória/FDs (OOM/EMFILE). Amplificação: cada `publish()` itera todos os handlers do tenant → custo O(N) por evento.
- **Correção:** limitar conexões por `establishmentId`+`sub` (ex.: 3–5), rejeitando excedente com 429; aplicar `rateLimit` na rota.

#### SEC-10 — JWT sem revogação/logout, validade fixa de 7 dias
**Arquivo:** [auth.ts:28](backend/src/plugins/auth.ts#L28) · **CWE-613**

`authenticate` só faz `jwtVerify()` (valida assinatura) — não há _blocklist_, `tokenVersion` nem endpoint de logout server-side. Trocar dados de perfil não rotaciona credencial; não existe troca de senha.
- **Impacto:** token vazado/roubado vale 7 dias inteiros sem forma de invalidação. Único paliativo hoje seria rotacionar o `JWT_SECRET` (desloga todos).
- **Correção:** _access token_ curto (15 min) + _refresh token_ opaco persistido com `revokedAt`; verificar existência do tenant no `authenticate`.

#### SEC-11 — Enumeração de clientes e vazamento de nome (PII) via `/identify`
**Arquivo:** [public/service.ts:370](backend/src/modules/public/service.ts#L370) · **CWE-204**

O endpoint anônimo devolve o **nome real** do cliente para qualquer telefone existente na base, `null` caso contrário. Há _rate-limit_ 10/min por IP, mas isso ainda são ~14 mil tentativas/dia.
- **Impacto:** confirmar que um número é cliente de um estabelecimento específico (sensível em clínicas) e obter o nome associado. Resposta binária = oráculo perfeito de existência.
- **Correção:** exigir OTP antes de revelar nome; resposta constante independente de existência; _rate-limit_ por telefone+estabelecimento, não só por IP.

#### SEC-12 — Injeção de iCalendar (CRLF) no gerador de `.ics`
**Arquivo:** [SuccessStep.tsx:12](frontend/src/components/booking/SuccessStep.tsx#L12) · **CWE-93**

`escapeIcsText` escapa apenas `\`, `,` e `;` — **não** codifica CR/LF (exigido pela RFC 5545). Os campos `service.name`, `establishment.name`, `employee.name` não bloqueiam `\n` nos schemas Zod do backend.
- **Impacto:** um dono de estabelecimento pode gravar um nome de serviço com quebra de linha + `BEGIN:VALARM`/`BEGIN:VEVENT`. Quando o cliente clica em "Adicionar ao calendário", o `.ics` injeta alarmes/eventos-fantasma (phishing) na agenda do cliente final — cruza fronteira de confiança.
- **Correção:** adicionar `.replace(/\r\n|\r|\n/g, '\\n')` em `escapeIcsText`; como _defense-in-depth_, rejeitar caracteres de controle nos schemas de `name`.

#### SEC-13 — Senha do PostgreSQL versionada no repositório
**Arquivos:** [env.ts:7](backend/src/env.ts#L7), [.env.example:1](backend/.env.example#L1), [README.md:16](README.md#L16) · **CWE-798**

A senha de banco (`803060`) aparece como _default_ no código-fonte, no `.env.example` e documentada no README. (O arquivo `.env` em si **não** foi commitado — está no `.gitignore` — mas o valor está exposto nos três locais acima, agora em repositório público.)

```ts
DATABASE_URL: z.string().default('postgres://postgres:803060@localhost:5432/agendadb'),
```

- **Impacto:** credencial versionada em repo público. Risco real é **baixo** por ser credencial de dev apontando para `localhost`, mas é higiene ruim e o _default_ silencioso mascara erro de configuração em produção (diferente do `JWT_SECRET`, que corretamente falha).
- **Correção:** remover o `.default()` de `DATABASE_URL` (exigir via ambiente, como o `JWT_SECRET`); trocar a senha do banco de dev; deixar o README/`.env.example` sem valores reais.

---

### 🟡 BAIXA

#### SEC-09 — SSE reflete `Origin` arbitrário em `Access-Control-Allow-Origin`
**Arquivo:** [realtime/routes.ts:21](backend/src/modules/realtime/routes.ts#L21) · **CWE-942**
O endpoint ecoa `request.headers.origin` (fallback `*`) em vez de validar contra `env.CORS_ORIGIN`. Impacto limitado (sem `Allow-Credentials`; acesso ainda exige token válido), mas contraria a política de CORS do resto da app. **Correção:** validar o `Origin` contra a allowlist existente; sem fallback `*`.

#### SEC-15 — Limite do plano Free não é aplicado no backend
**Arquivo:** [employees/service.ts:142](backend/src/modules/employees/service.ts#L142) · **CWE-602**
`FREE_EMPLOYEE_LIMIT = 99` ("temporariamente desativado — fase de testes") e `PLAN_LIMITS.employees = 99`. Na prática o limite de "1 profissional" só existe no frontend; uma chamada direta a `POST /employees` contorna a monetização. Sem risco de dados, mas o backend não é fonte de verdade do plano. **Correção:** restaurar o limite real por plano antes de produção.

#### SEC-16 — Listagens sem paginação retornam todos os registros do tenant
**Arquivo:** [clients/service.ts:36](backend/src/modules/clients/service.ts#L36) · **CWE-770**
`listClients`/`listAppointments` retornam todas as linhas do tenant. Combinado com SEC-02 (criação ilimitada de clientes), a listagem pode crescer sem limite e degradar API + UI. **Correção:** paginação (limit/offset ou cursor) nas listagens.

#### SEC-17 — Datas/horários usam o fuso local do processo, não o do estabelecimento
**Arquivo:** [datetime.ts:33-40](backend/src/lib/datetime.ts#L33-L40) · **CWE-367**
`todayStr()`/`nowMinutes()` usam `new Date()` cru. Se o servidor rodar em UTC e o estabelecimento estiver em outro fuso, perto da meia-noite a checagem de "horário já passou" diverge — permite reservar um horário que já passou no fuso local (ou rejeitar horário válido). Cálculo de dia-da-semana é _TZ-safe_. **Correção:** persistir timezone por estabelecimento e converter explicitamente.

#### SEC-18 — Criação de agendamento pelo painel ignora expediente/almoço/bloqueios
**Arquivo:** [appointments/service.ts:193](backend/src/modules/appointments/service.ts#L193) · **CWE-840**
O fluxo autenticado valida apenas conflito de horário — não checa `workingHours`, `isClosed`, jornada, almoço nem `timeBlocks` (intencional, para _walk-in_). Risco limitado ao próprio tenant, mas gera inconsistência com o link público. **Correção:** validar por padrão e oferecer _flag_ `force` consciente.

#### SEC-22 — Produção executada via `tsx` (runtime de desenvolvimento)
**Arquivo:** [package.json:7-8](backend/package.json#L7-L8)
`start` usa `tsx src/server.ts` — transpila em tempo de execução, sem _build_ compilado. Maior superfície, pior performance e _stack traces_ de dev em produção. **Correção:** compilar com `tsc`/`tsup` e rodar `node dist/`.

---

### ⚪ INFO (defense-in-depth e boas práticas)

| ID | Achado | Arquivo | Correção |
|---|---|---|---|
| SEC-19 | _Double-booking_ depende só do _advisory lock_; sem constraint no banco | [schema.ts:264](backend/src/db/schema.ts#L264) | `EXCLUDE USING gist` sobre `employee_id` + `tsrange` (requer `btree_gist`) como rede de segurança |
| SEC-20 | `logoUrl`/`photoUrl` aceitam esquema `javascript:`/`data:` (só usados em `<img src>` hoje — sem XSS explorável) | [employees/schemas.ts:5](backend/src/modules/employees/schemas.ts#L5) | `.refine(v => /^https?:\/\//i.test(v))` |
| SEC-21 | Custo do bcrypt em 10 (abaixo do recomendado atual de 12) | [auth/service.ts:40](backend/src/modules/auth/service.ts#L40) | elevar para 12 |
| SEC-23 | Sem `engines` (versão de Node não fixada) | [package.json](backend/package.json) | fixar `engines.node` |
| SEC-24 | Sem `NODE_ENV` no schema; bind em `0.0.0.0` sem TLS/proxy documentado | [server.ts:7](backend/src/server.ts#L7) | terminar TLS num _reverse proxy_; documentar |
| SEC-25 | Sem testes automatizados, sem CI, sem `npm audit` no fluxo | [package.json](backend/package.json) | pipeline com `npm audit` + testes de rota |
| SEC-26 | Versões de dependências a validar | [package.json](backend/package.json) | rodar `npm audit` e atualizar |

---

## 4. Resposta direta aos vetores citados

**"Invasão pelo DevTools do navegador"** — o frontend é 100% inspecionável (é esperado). O que importa é que **nenhuma proteção depende só do cliente**: `ProtectedRoute` é apenas visual, mas toda rota é validada no backend com o token. O usuário pode alterar qualquer request no DevTools, porém não consegue acessar dados de outro tenant (o `establishmentId` vem do token assinado, não do que ele digita). **Exceção:** o limite do plano Free (SEC-15) hoje só existe na UI — via DevTools/`curl` dá para criar mais profissionais que o plano permite (bypass de monetização, não de dados).

**"DDoS / negação de serviço"** — este é o ponto mais fraco. Sem _rate-limit_ em login (SEC-01), agendamento público (SEC-02) e SSE (SEC-08), um único atacante consegue: saturar CPU com `bcrypt`, encher a agenda e a base de clientes, e esgotar memória com conexões SSE. `helmet` + `rate-limit` global + captcha + um proxy/WAF na frente (Cloudflare) resolvem a maior parte. _Rate-limit_ de aplicação **não** substitui proteção de camada de rede para DDoS volumétrico — recomenda-se CDN/WAF.

**"Invasão / ataques em geral"** — sem SQLi, sem IDOR, sem _mass assignment_. Os vetores concretos de invasão são: **(1)** força-bruta de senha (SEC-01) e **(2)** roubo de token via XSS (SEC-05, agravado por SEC-06). Fechar rate-limit, helmet/CSP e revogação de token cobre os dois.

---

## 5. Roadmap de melhorias e features

### 5.1 Hardening de segurança (antes de produção)
| # | Item | Esforço | Por quê |
|---|---|---|---|
| H1 | `@fastify/helmet` (CSP, HSTS, X-Frame-Options…) | Baixo | Fecha clickjacking/MIME-sniffing; base para tudo (SEC-06) |
| H2 | _Rate-limit_ em login/register/appointments | Baixo | Corta força-bruta e spam (SEC-01, SEC-02) |
| H3 | Validar `Origin` do SSE + `redact` de logs | Baixo | SEC-07, SEC-09 |
| H4 | _Refresh token_ + revogação + logout real | Médio | SEC-05, SEC-10 |
| H5 | Verificação de e-mail + "esqueci minha senha" | Médio | Hoje não existe recuperação de senha — churn garantido |
| H6 | Tabela de _audit log_ | Médio | App financeiro sem trilha de quem estornou/apagou |
| H7 | Observabilidade (`request-id`, Sentry, `/health` real com `select 1`) | Médio | Incidentes multi-tenant hoje são cegos |
| H8 | Backups automatizados / PITR | Médio | Perda de dados é fatal para SaaS de agenda+financeiro |
| H9 | CAPTCHA invisível no link público | Médio | Corta abuso automatizado (SEC-02) |
| H10 | 2FA (TOTP) opcional para o dono | Alto | Protege a conta que controla financeiro + PII |

### 5.2 Features de produto
| # | Feature | Esforço | Valor |
|---|---|---|---|
| P1 | **Lembretes/confirmação por WhatsApp/SMS** | Alto | **Maior impacto em no-show**; schema já tem `phone`, `socials.whatsapp`, `autoConfirm` |
| P2 | Depósito/sinal anti-no-show | Alto | Trava a vaga; `status pending` já modela isso (depende de P3) |
| P3 | Pagamento online real (Pix/cartão) | Alto | Hoje `payments` é só "caixa registrador"; habilita cobrança e billing |
| P4 | Avaliações/NPS pós-atendimento | Médio | Prova social no link público + métrica por profissional |
| P5 | Recorrência ("todo mês, mesmo horário") | Médio | Ocupação recorrente; reaproveita `assertNoConflict` |
| P6 | Fidelidade / pacotes pré-pagos | Médio | `services.isPackage` já existe; retenção |
| P7 | Multi-unidade nos planos pagos | Alto | Upsell de ticket alto; **desenhar junto de H4** (mesmo `auth.ts`) |
| P8 | Relatório fiscal / exportação contábil (CSV/PDF, comissões) | Médio | `reports` + `transactions` + `employeeCommissions` já existem |
| P9 | **LGPD**: consentimento, exportação e exclusão de dados | Médio | Coleta PII no link público sem base legal registrada — risco jurídico BR |
| P10 | Billing self-service (checkout, webhooks, downgrade) | Alto | Transforma o freemium em receita (depende de P3) |

### 5.3 Sequenciamento recomendado
1. **Fundação de produção:** H1, H2, H3, H7, H8, SEC-13 (segredos).
2. **Confiança de conta:** H5 → H4 → H6.
3. **Motor de receita:** P3 → P10 → P2.
4. **Crescimento:** P1 (maior impacto isolado), P4, P5, P6.
5. **Enterprise/compliance:** P7 (junto de H4), P9, P8, H10, H9.

> **Nota de arquitetura:** trate H4 (_refresh token_), P7 (multi-unidade) e H10 (2FA) como um único épico de "identidade" — todos reescrevem `plugins/auth.ts` e o payload do JWT (`{ sub, establishmentId }`). Fazê-los em momentos separados custa retrabalho.

---

## 6. Plano de ação imediato (checklist)

- [ ] **SEC-01/SEC-02:** adicionar `config.rateLimit` em `/auth/login`, `/auth/register`, `POST /public/:slug/appointments` (e idealmente tornar o rate-limit global).
- [ ] **SEC-06:** `app.register(helmet)` com CSP.
- [ ] **SEC-04:** no fluxo público, preencher só campos nulos do cliente; nunca sobrescrever PII.
- [ ] **SEC-07:** `logger: { redact: ['req.url'] }` + token efêmero para o SSE.
- [ ] **SEC-05/SEC-10:** _refresh token_ + revogação; avaliar cookie `httpOnly`.
- [ ] **SEC-13:** remover default de `DATABASE_URL`, trocar a senha de dev, limpar README/`.env.example`.
- [ ] **SEC-08:** teto de conexões SSE por tenant.
- [ ] **SEC-12:** escapar CR/LF no gerador de `.ics`.
- [ ] **SEC-15:** restaurar o limite de plano no backend antes de cobrar por ele.
- [ ] Colocar um WAF/CDN (ex.: Cloudflare) na frente para DDoS volumétrico.

---

## 7. Metodologia e limitações

- **Abordagem:** revisão de código estática por múltiplos agentes especializados (auth/multi-tenancy, injeção/XSS, DoS/rate-limit, segredos/config, lógica de negócio, frontend/DevTools, dependências), com uma etapa de **verificação adversarial** onde cada achado foi reconfirmado lendo o código real e produzindo uma prova de conceito. Achados sem evidência concreta foram descartados.
- **Cobertura:** todo o `backend/src` e `frontend/src`. 40 achados verificados, consolidados aqui em ~26 itens únicos (duplicatas entre dimensões foram mescladas). Nenhum falso positivo sobreviveu à verificação; um achado (allowlist de URL, SEC-20) foi rebaixado para INFO por não ter sink explorável hoje.
- **Limitações:** análise **estática** — não houve teste dinâmico (DAST), fuzzing, `npm audit` executado, nem pentest contra ambiente rodando. As versões de dependências (SEC-26) devem ser validadas com `npm audit`. Recomenda-se um pentest dedicado antes do go-live com dados reais.

---

*Relatório gerado por auditoria automatizada assistida. Trate-o como ponto de partida priorizado, não como substituto de um pentest profissional.*
