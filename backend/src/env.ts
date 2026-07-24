import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://postgres:803060@localhost:5432/agendadb'),
  // Sem default: com um segredo público conhecido qualquer um forja tokens
  // de qualquer tenant. A aplicação deve falhar ao subir sem ele (.env).
  JWT_SECRET: z.string().min(20, 'JWT_SECRET deve ter no mínimo 20 caracteres'),
  PORT: z.coerce.number().default(3333),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // E-mail transacional (Resend). Opcional: sem a chave a app sobe normalmente e
  // os envios viram no-op (logados no console), útil em dev. Em produção,
  // defina a chave e um remetente de domínio verificado no Resend.
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('Kairoon <onboarding@resend.dev>'),
  // Gateway de pagamento (Asaas). Sem default: a app deve falhar ao subir sem a
  // chave assim que o módulo de pagamento entrar em uso (mesma lógica do
  // JWT_SECRET). ASAAS_ENV escolhe a base URL (sandbox vs produção).
  ASAAS_API_KEY: z.string().min(1, 'ASAAS_API_KEY é obrigatória'),
  ASAAS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  // Token enviado pelo Asaas no header `asaas-access-token` de cada webhook
  // (configurado no painel Asaas ao cadastrar a URL do webhook).
  ASAAS_WEBHOOK_TOKEN: z.string().min(1, 'ASAAS_WEBHOOK_TOKEN é obrigatório'),
  // Bunny.net Storage: upload de logos, banners e fotos de perfil. Todas
  // opcionais: sem elas a app sobe normalmente e o endpoint de upload responde
  // 503 (o resto do sistema segue aceitando URLs de imagem coladas à mão).
  // ENDPOINT é o host da Storage Zone (Frankfurt/DE = storage.bunnycdn.com),
  // ZONE o nome da zona, PASSWORD a AccessKey de leitura+escrita (só no backend)
  // e CDN_URL o hostname da Pull Zone que serve os arquivos publicamente.
  BUNNY_STORAGE_ENDPOINT: z.string().optional(),
  BUNNY_STORAGE_ZONE: z.string().optional(),
  BUNNY_STORAGE_PASSWORD: z.string().optional(),
  BUNNY_CDN_URL: z.string().optional(),
})

export const env = envSchema.parse(process.env)
