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
})

export const env = envSchema.parse(process.env)
