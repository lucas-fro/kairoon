import { env } from '../env'
import { AppError } from './errors'

const BASE_URL =
  env.ASAAS_ENV === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3'

interface AsaasErrorBody {
  errors?: { code?: string; description?: string }[]
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: env.ASAAS_API_KEY,
      ...init?.headers,
    },
  })

  // 204 (ex.: DELETE de subscription) não tem corpo JSON.
  const body = response.status === 204 ? null : ((await response.json().catch(() => null)) as unknown)

  if (!response.ok) {
    const errorBody = body as AsaasErrorBody | null
    const message = errorBody?.errors?.[0]?.description ?? 'Falha na comunicação com o gateway de pagamento'
    // Erro do Asaas em 4xx normalmente é dado inválido/cartão recusado (repassa
    // pro cliente); 5xx/rede é indisponibilidade do gateway (502 pro nosso client).
    throw new AppError(message, response.status >= 500 ? 502 : 422)
  }

  return body as T
}

export interface AsaasCustomer {
  id: string
  name: string
  email: string
  cpfCnpj: string
}

/** Busca por CPF/CNPJ — o Asaas não deduplica automaticamente na criação. */
export async function findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
  const result = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`,
  )
  return result.data[0] ?? null
}

export async function createCustomer(input: {
  name: string
  email: string
  cpfCnpj: string
  phone?: string
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function findOrCreateCustomer(input: {
  name: string
  email: string
  cpfCnpj: string
  phone?: string
}): Promise<AsaasCustomer> {
  const existing = await findCustomerByCpfCnpj(input.cpfCnpj)
  if (existing) return existing
  return createCustomer(input)
}

export interface AsaasCreditCard {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

export interface AsaasCreditCardHolderInfo {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
}

export interface AsaasSubscription {
  id: string
  status: string
  nextDueDate: string
  value: number
  cycle: 'MONTHLY' | 'YEARLY'
  // Presente na criação com cartão: token reutilizável + dados mascarados
  // (nunca o número completo) pra exibir "•••• 4444" na UI.
  creditCard?: {
    creditCardNumber?: string
    creditCardBrand?: string
    creditCardToken?: string
  }
}

export async function createCreditCardSubscription(input: {
  customer: string
  cycle: 'MONTHLY' | 'YEARLY'
  value: number
  nextDueDate: string
  creditCard: AsaasCreditCard
  creditCardHolderInfo: AsaasCreditCardHolderInfo
  remoteIp: string
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      customer: input.customer,
      billingType: 'CREDIT_CARD',
      cycle: input.cycle,
      value: input.value,
      nextDueDate: input.nextDueDate,
      creditCard: input.creditCard,
      creditCardHolderInfo: input.creditCardHolderInfo,
      remoteIp: input.remoteIp,
    }),
  })
}

export async function cancelAsaasSubscription(asaasSubscriptionId: string): Promise<void> {
  await asaasFetch(`/subscriptions/${asaasSubscriptionId}`, { method: 'DELETE' })
}

/**
 * Atualiza valor/ciclo de uma assinatura já existente mantendo o mesmo cartão
 * (o Asaas já mantém o cartão vinculado à assinatura do lado dele — não
 * precisa reenviar dado nenhum de cartão aqui). Por padrão só afeta cobranças
 * futuras, a já gerada pro ciclo atual não muda.
 */
export async function updateAsaasSubscription(
  asaasSubscriptionId: string,
  input: { value: number; cycle: 'MONTHLY' | 'YEARLY' },
): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${asaasSubscriptionId}`, {
    method: 'POST',
    body: JSON.stringify({ value: input.value, cycle: input.cycle }),
  })
}
