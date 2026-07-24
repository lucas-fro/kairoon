export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333'

const TOKEN_KEY = 'agenda.token'

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly issues?: Record<string, string[]>,
    /** Código estável vindo do backend (ex.: 'TRIAL_EXPIRED'). */
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** false para rotas públicas (não envia Authorization) */
  auth?: boolean
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options

  // FormData (upload de arquivo) viaja como multipart: não serializa em JSON e
  // deixa o browser definir o Content-Type com o boundary correto.
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData

  const headers: Record<string, string> = {}
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor', 0)
  }

  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && auth) {
      clearToken()
      window.dispatchEvent(new Event('auth:logout'))
    }
    // Teste grátis expirado: conta em somente-leitura. NÃO desloga (diferente do
    // 401); só avisa a UI para mostrar o convite de upgrade.
    if (response.status === 402 && data?.code === 'TRIAL_EXPIRED') {
      window.dispatchEvent(new Event('trial:expired'))
    }
    throw new ApiError(data?.message ?? 'Erro inesperado', response.status, data?.issues, data?.code)
  }

  return data as T
}
