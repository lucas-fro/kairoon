import type { Product } from '../types/api'
import { api } from './client'

export interface ProductPayload {
  name: string
  priceCents: number
  stockQuantity: number
  active?: boolean
  brand?: string | null
  description?: string | null
  sku?: string | null
  barcode?: string | null
  costCents?: number | null
}

export function listProducts() {
  return api<Product[]>('/products')
}

export function createProduct(data: ProductPayload) {
  return api<Product>('/products', { method: 'POST', body: data })
}

export function updateProduct(id: string, data: Partial<ProductPayload>) {
  return api<Product>(`/products/${id}`, { method: 'PUT', body: data })
}

export function deleteProduct(id: string) {
  return api<void>(`/products/${id}`, { method: 'DELETE' })
}
