import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Boxes, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createProduct, deleteProduct, listProducts, updateProduct } from '../../api/products'
import type { ProductPayload } from '../../api/products'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Dialog } from '../../components/ui/Dialog'
import { DialogActions } from '../../components/ui/DialogActions'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input } from '../../components/ui/Input'
import { PageHeader } from '../../components/ui/PageHeader'
import { SkeletonList } from '../../components/ui/Skeleton'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { Textarea } from '../../components/ui/Textarea'
import { useToast } from '../../components/ui/Toast'
import { formatBRL, parseBRLToCents } from '../../lib/format'
import type { Product } from '../../types/api'

const LOW_STOCK_THRESHOLD = 5

interface FormState {
  name: string
  price: string
  stock: string
  brand: string
  supplier: string
  cost: string
  sku: string
  barcode: string
  description: string
}

const EMPTY_FORM: FormState = {
  name: '',
  price: '',
  stock: '',
  brand: '',
  supplier: '',
  cost: '',
  sku: '',
  barcode: '',
  description: '',
}

export function StockPage() {
  const toast = useToast()
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: ['products'], queryFn: listProducts })

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Product | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<{ name?: string; price?: string }>({})
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)

  const products = query.data ?? []

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setDialogOpen(true)
  }

  function openEdit(product: Product) {
    setEditing(product)
    setForm({
      name: product.name,
      price: (product.priceCents / 100).toFixed(2).replace('.', ','),
      stock: String(product.stockQuantity),
      brand: product.brand ?? '',
      supplier: product.supplier ?? '',
      cost: product.costCents != null ? (product.costCents / 100).toFixed(2).replace('.', ',') : '',
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      description: product.description ?? '',
    })
    setFormErrors({})
    setDialogOpen(true)
  }

  const saveMutation = useMutation({
    mutationFn: (input: { id?: string; data: ProductPayload }) =>
      input.id ? updateProduct(input.id, input.data) : createProduct(input.data),
    onSuccess: (_result, input) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(input.id ? 'Produto atualizado!' : 'Produto cadastrado!')
      setDialogOpen(false)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const toggleMutation = useMutation({
    mutationFn: (product: Product) => updateProduct(product.id, { active: !product.active }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(updated.active ? 'Produto ativado!' : 'Produto desativado.')
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Erro inesperado'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produto excluído.')
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Erro inesperado')
      setDeleteTarget(null)
    },
  })

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: { name?: string; price?: string } = {}
    const priceCents = parseBRLToCents(form.price)
    if (!form.name.trim()) nextErrors.name = 'Informe o nome do produto'
    if (priceCents <= 0) nextErrors.price = 'Informe um preço válido'
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const data: ProductPayload = {
      name: form.name.trim(),
      priceCents,
      stockQuantity: Math.max(0, Number(form.stock.replace(/\D/g, '')) || 0),
      brand: form.brand.trim() || null,
      supplier: form.supplier.trim() || null,
      costCents: form.cost.trim() ? parseBRLToCents(form.cost) : null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      description: form.description.trim() || null,
    }
    saveMutation.mutate({ id: editing?.id, data })
  }

  // Margem estimada para o formulário
  const priceCentsForm = parseBRLToCents(form.price)
  const costCentsForm = form.cost.trim() ? parseBRLToCents(form.cost) : 0
  const showMargin = priceCentsForm > 0 && costCentsForm > 0
  const marginCents = priceCentsForm - costCentsForm
  const marginPct = priceCentsForm > 0 ? Math.round((marginCents / priceCentsForm) * 100) : 0

  function stockBadge(product: Product) {
    if (product.stockQuantity <= 0) return <Badge tone="error">Esgotado</Badge>
    if (product.stockQuantity <= LOW_STOCK_THRESHOLD) return <Badge tone="warning">Baixo</Badge>
    return null
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        description="Produtos disponíveis para venda no fechamento dos atendimentos."
        actions={
          <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
            Novo produto
          </Button>
        }
      />

      {query.isPending && <SkeletonList rows={5} />}

      {query.isError && (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <AlertCircle className="h-6 w-6 text-error" />
            <p className="text-sm text-ink-secondary">Não foi possível carregar os produtos.</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {!query.isPending && !query.isError && products.length === 0 && (
        <EmptyState
          icon={Boxes}
          title="Nenhum produto cadastrado"
          description="Cadastre produtos para vendê-los junto com os atendimentos e controlar o estoque."
          action={
            <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
              Novo produto
            </Button>
          }
        />
      )}

      {!query.isPending && !query.isError && products.length > 0 && (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                <Th>Produto</Th>
                <Th>Preço</Th>
                <Th>Estoque</Th>
                <Th>Status</Th>
                <Th className="text-right">Ações</Th>
              </Tr>
            </THead>
            <TBody>
              {products.map((product) => (
                <Tr key={product.id}>
                  <Td>
                    <p className="font-medium text-ink">{product.name}</p>
                    {(product.brand || product.sku) && (
                      <p className="mt-0.5 text-xs text-ink-tertiary">
                        {[product.brand, product.sku].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </Td>
                  <Td className="font-medium text-ink">{formatBRL(product.priceCents)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <span className="text-ink">{product.stockQuantity} un.</span>
                      {stockBadge(product)}
                    </div>
                  </Td>
                  <Td>
                    {product.active ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="neutral">Inativo</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(product)}
                        leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleMutation.mutate(product)}
                        isLoading={
                          toggleMutation.isPending && toggleMutation.variables?.id === product.id
                        }
                        leftIcon={<Power className="h-3.5 w-3.5" />}
                      >
                        <span className="w-[4.5rem] text-left">
                          {product.active ? 'Desativar' : 'Ativar'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget(product)}
                        className="text-error-dark hover:bg-error-light hover:text-error-dark"
                        leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                      >
                        Excluir
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? 'Editar produto' : 'Novo produto'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Nome"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="Ex.: Pomada modeladora"
            error={formErrors.name}
            autoFocus
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Preço de venda"
              inputMode="decimal"
              value={form.price}
              onChange={(e) => setField('price', e.target.value)}
              placeholder="35,00"
              error={formErrors.price}
              leftIcon={<span className="text-sm">R$</span>}
            />
            <Input
              label="Estoque"
              inputMode="numeric"
              value={form.stock}
              onChange={(e) => setField('stock', e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              hint="Quantidade em estoque"
            />
          </div>

          {/* Campos opcionais */}
          <div className="space-y-4 border-t border-line-divider pt-4">
            <p className="text-[13px] font-medium text-ink-secondary">
              Detalhes do produto <span className="font-normal text-ink-tertiary">(opcional)</span>
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Marca"
                value={form.brand}
                onChange={(e) => setField('brand', e.target.value)}
                placeholder="Ex.: Viking"
              />
              <Input
                label="Fornecedor"
                value={form.supplier}
                onChange={(e) => setField('supplier', e.target.value)}
                placeholder="Ex.: Distribuidora Silva"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Preço de custo"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => setField('cost', e.target.value)}
                placeholder="18,00"
                leftIcon={<span className="text-sm">R$</span>}
                hint={showMargin ? `Margem: ${formatBRL(marginCents)} (${marginPct}%)` : undefined}
              />
              <Input
                label="Código (SKU)"
                value={form.sku}
                onChange={(e) => setField('sku', e.target.value)}
                placeholder="Ex.: POM-001"
              />
            </div>

            <Input
              label="Código de barras"
              inputMode="numeric"
              value={form.barcode}
              onChange={(e) => setField('barcode', e.target.value)}
              placeholder="789..."
            />

            <Textarea
              label="Descrição"
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
              placeholder="Anotações sobre o produto…"
            />
          </div>

          <DialogActions className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" isLoading={saveMutation.isPending}>
              {editing ? 'Salvar' : 'Cadastrar'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
        }}
        title="Excluir produto?"
        description={
          deleteTarget
            ? `O produto "${deleteTarget.name}" será removido permanentemente.`
            : undefined
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}
