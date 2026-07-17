# Ir para produção: pagamentos (Asaas)

Checklist para colocar a assinatura de planos pagos em produção. O código já
está pronto e testado de ponta a ponta no sandbox (assinar, cobrar, confirmar
por webhook, ativar plano, trocar de plano e cancelar).

## Status atual (validado no sandbox)

- [x] Checkout na UI cria a assinatura no Asaas (cartão tokenizado)
- [x] Cobrança confirmada e webhook `PAYMENT_CONFIRMED` processado
- [x] Plano ativado e comprovante por e-mail disparado
- [x] Troca de plano sem pedir o cartão de novo
- [x] Cancelamento (mantém acesso até o fim do período já pago)
- [x] Typecheck limpo no backend e no frontend

## 0. Decisões de negócio (resolver antes de cobrar de verdade)

### a) "Grátis" x cobrança imediata
A LP diz "Começar grátis" e "Teste grátis por 14 dias", mas o checkout cobra o
cartão na hora (`nextDueDate = hoje`). Escolha uma:

- [ ] Implementar trial real (primeira cobrança daqui a 14 dias, o Asaas
      suporta via `nextDueDate` futuro), ou
- [ ] Trocar o texto da LP para algo como "Assinar agora"

### b) O que cada plano libera
Hoje o único gate que muda por plano é o limite de profissionais. WhatsApp, Pix
e página personalizada ainda não são bloqueados (`MARKETING_REQUIRES_PRO` está
desligado em `backend/src/lib/plan.ts`).

- [ ] Definir e implementar o que cada plano pago libera

### c) Preços
Fixos em `backend/src/lib/plans.ts`: Básico R$99/mês (R$948/ano), Essencial
R$249/mês (R$2388/ano).

- [ ] Confirmar que os valores estão corretos

## 1. Conta Asaas de produção

- [ ] Conta real verificada (documentos + conta bancária para receber)
- [ ] Cobrança recorrente com cartão habilitada (confirmar com o suporte Asaas,
      pode exigir análise/liberação)
- [ ] API key de produção obtida no painel asaas.com (o prefixo é diferente da
      sandbox, que é `$aact_hmlg_...`)

## 2. Variáveis de ambiente na VPS

Vão no arquivo `.env` da raiz do projeto (lido pelo `docker-compose.yml` via
`env_file: .env`). O modelo está em `.env.example`.

| Variável | Valor em produção |
| --- | --- |
| `ASAAS_API_KEY` | key de produção |
| `ASAAS_ENV` | `production` (troca a URL da API do Asaas automaticamente) |
| `ASAAS_WEBHOOK_TOKEN` | token novo e forte só de prod (`openssl rand -hex 32`), não reusar o de dev |
| `CORS_ORIGIN` | `https://app.kairoon.com.br` (os links dos e-mails usam esse valor) |
| `JWT_SECRET` | segredo forte real (não o de dev) |
| `DATABASE_URL` | Postgres de produção |
| `RESEND_API_KEY` / `RESEND_FROM` | confirmar que o domínio kairoon.com.br está verificado no Resend |

- [ ] `.env` de produção preenchido

## 3. Webhook no painel do Asaas

Sem isso a assinatura fica "pendente" para sempre (o pagamento nunca é
confirmado do lado do Kairoon).

- URL: `https://app.kairoon.com.br/api/payments/webhook`
  (o nginx do frontend tira o `/api` e encaminha para o backend `/payments/webhook`)
- Token: o mesmo valor de `ASAAS_WEBHOOK_TOKEN` (o Asaas envia no header
  `asaas-access-token` e o backend compara)
- Eventos: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`

- [ ] Webhook cadastrado e ativo

## 4. Subir o código

- [ ] Merge de `feature/asaas-payments` na `main`
- [ ] Deploy (git pull na VPS + `docker compose build` + `docker compose up -d`,
      ou o seu CI). Rebuilda frontend, backend e LP juntos.

As migrations rodam sozinhas: o `backend/docker-entrypoint.sh` aplica
`npm run db:migrate` antes de subir a API. As tabelas `subscriptions` e
`payments` são criadas no deploy, não precisa rodar nada na mão.

## 5. Validar em produção (1 transação real)

- [ ] Uma assinatura real com cartão de verdade (o menor plano)
- [ ] Conferir: cobrança aparece no painel Asaas, webhook chega, assinatura fica
      "Ativa", plano sobe e o comprovante cai no e-mail
- [ ] Cancelar/estornar se foi só teste (aqui é dinheiro real)

## 6. PCI (ter ciência, não é bloqueio)

O checkout é formulário próprio: o número do cartão passa pelo backend uma vez
(sem gravar, sem logar) antes de ir ao Asaas. Funciona, mas te coloca num
escopo de PCI maior (SAQ D) do que um checkout hospedado. Se o Asaas pedir
atestado de PCI, será preciso tratar. O HTTPS ponta a ponta já é garantido pelo
Caddy.
