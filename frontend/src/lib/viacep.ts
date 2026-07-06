export interface CepAddress {
  street: string
  neighborhood: string
  city: string
  state: string
}

/**
 * Consulta o CEP na API pública do ViaCEP e retorna o endereço estruturado.
 * Retorna null se o CEP não tiver 8 dígitos, não existir ou a consulta falhar.
 */
export async function fetchAddressByCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.erro) return null
    return {
      street: data.logradouro ?? '',
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    }
  } catch {
    return null
  }
}
