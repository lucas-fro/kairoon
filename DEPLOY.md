# Deploy na VPS (Docker Compose)

A aplicação sobe em **3 containers** na rede Docker externa **`web`**:

| Serviço  | Container          | Papel                                                        |
|----------|--------------------|--------------------------------------------------------------|
| backend  | `kairoon-backend`  | API Fastify (porta interna 3333, não exposta ao host)        |
| frontend | `kairoon-frontend` | nginx servindo o SPA React + proxy `/api` → backend          |
| lp       | `kairoon-lp`       | nginx servindo a landing page estática                       |

O **Postgres** e o **Caddy** vivem em **outro compose**, na mesma rede `web`.
O Caddy faz o TLS e o roteamento por domínio; o backend **não** é exposto ao
Caddy — o nginx do frontend faz proxy de `/api` para ele (mesma origem, sem CORS).

```
Internet ──► Caddy (outro compose)
               ├─ kairoon.com.br      ──► kairoon-lp:80
               └─ app.kairoon.com.br  ──► kairoon-frontend:80
                                             └─ /api/* ──► kairoon-backend:3333
kairoon-backend ──► Postgres (outro compose) via rede "web"
```

## 1. Rede `web`

Se ainda não existir (normalmente o compose do Postgres/Caddy já a cria):

```bash
docker network create web
```

Se o outro compose já define `web`, **não** recrie — apenas garanta que este
projeto a use como `external: true` (já configurado).

## 2. Configurar o `.env`

```bash
cp .env.example .env
nano .env
```

Preencha principalmente:

- `DATABASE_URL` — host = nome do container do Postgres no outro compose
  (ex.: `postgres://kairoon:senha@postgres:5432/agendadb`).
- `JWT_SECRET` — gere com `openssl rand -hex 32`.
- `CORS_ORIGIN=https://app.kairoon.com.br`
- `RESEND_API_KEY` / `RESEND_FROM` (e-mail transacional em produção).

O banco `agendadb` é criado e migrado automaticamente no start do backend
(`docker-entrypoint.sh` roda `db:create` + `db:migrate` com retry até o
Postgres responder). Se o usuário do banco não tiver permissão de `CREATE
DATABASE`, crie o banco `agendadb` manualmente uma vez.

## 3. Subir

```bash
docker compose up -d --build
docker compose logs -f backend   # acompanhar migrations + start
```

## 4. Configurar o Caddy (no outro compose)

Adicione ao `Caddyfile`:

```caddyfile
kairoon.com.br {
    reverse_proxy kairoon-lp:80
}

app.kairoon.com.br {
    reverse_proxy kairoon-frontend:80
}
```

Depois recarregue o Caddy (ex.: `docker exec <caddy> caddy reload --config /etc/caddy/Caddyfile`).

## 5. Atualizações futuras

```bash
git pull
docker compose up -d --build
```

Rebuild do frontend é necessário quando o código do SPA muda (o bundle é
estático). O backend aplica novas migrations sozinho no restart.
```
