import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { productsService } from '../services/products'
import { formatCurrency } from '../utils/formatCurrency'
import { formatQuantityWithUnit } from '../utils/uom'
import { useAuth } from '../hooks/useAuth'

export default function ProductsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(1)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Load categories once
  useEffect(() => {
    productsService
      .categories()
      .then((res) => setCategories(res.data?.data || []))
      .catch(() => {})
  }, [])

  const fetchProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = { page, per_page: 20 }
      if (search.trim()) params.search = search.trim()
      if (categoryFilter) params.category_id = categoryFilter
      const res = await productsService.list(params)
      setProducts(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load products')
    } finally {
      setIsLoading(false)
    }
  }, [page, search, categoryFilter])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [search, categoryFilter])

  async function handleDelete(product) {
    setIsDeleting(true)
    try {
      await productsService.delete(product.id)
      toast.success(`"${product.name}" has been deactivated`)
      setDeleteTarget(null)
      fetchProducts()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete product')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = [
    {
      key: 'image_url',
      label: 'Image',
      render: (val, row) =>
        val ? (
          <img src={val} alt={row.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200/80 shadow-2xs" />
        ) : (
          <div className="w-10 h-10 rounded-xl bg-slate-100/80 border border-slate-200/60 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        ),
    },
    {
      key: 'name',
      label: 'Name',
      render: (val, row) => (
        <div>
          <p
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/products/${row.id}/edit`)
            }}
            className="font-bold text-slate-900 hover:text-primary-600 hover:underline cursor-pointer transition-colors"
          >
            {val}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-slate-400 font-mono">{row.sku}</span>
            {row.variation && (
              <span className="text-[10px] bg-indigo-50/80 text-indigo-700 border border-indigo-200/60 px-1.5 py-0.2 rounded-md font-medium">
                {row.variation.name}{row.variation_value ? `: ${row.variation_value}` : ''}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'sku', label: 'SKU' },
    {
      key: 'category',
      label: 'Category',
      render: (val) => (val?.name ? <Badge variant="default">{val.name}</Badge> : <span className="text-slate-400">—</span>),
    },
    {
      key: 'brand',
      label: 'Brand',
      render: (val) =>
        val?.name ? (
          <span className="text-xs font-semibold text-slate-700 bg-slate-100/80 px-2 py-0.5 rounded-lg border border-slate-200/60">
            {val.name}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'usual_price',
      label: 'MRKT_Price',
      render: (val, row) => {
        const u = val ?? row.price
        return (
          <span className="text-slate-600 font-medium">
            {formatCurrency(u)}
            {row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}
          </span>
        )
      },
    },
    {
      key: 'our_price',
      label: 'Our_price',
      render: (val, row) => {
        const o = val ?? row.price
        return (
          <span className="font-bold text-primary-700">
            {formatCurrency(o)}
            {row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}
          </span>
        )
      },
    },
    {
      key: 'wholesale_price',
      label: 'Wholesale Price',
      render: (val, row) => {
        return val && Number(val) > 0 ? (
          <span className="font-semibold text-slate-800">
            {formatCurrency(val)}
            {row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      },
    },
    {
      key: 'predefined_discount',
      label: 'Discount',
      render: (_, row) => {
        const u = Number(row.usual_price ?? row.price ?? 0)
        const o = Number(row.our_price ?? row.price ?? 0)
        const diff = u - o
        return diff > 0 ? (
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-lg">
            -{formatCurrency(diff)}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )
      },
    },
    {
      key: 'cost_price',
      label: 'Cost Price',
      render: (val, row) =>
        val ? (
          <span className="text-slate-500 text-xs font-medium">
            {formatCurrency(val)}
            {row.pricing_unit && row.pricing_unit !== 'pcs' ? ` / ${row.pricing_unit}` : ''}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'quantity',
      label: 'Stock',
      render: (val, row) => {
        const isOut = Number(val) === 0
        const isLow = !isOut && Number(val) <= Number(row.low_stock_threshold)
        return (
          <div className="flex items-center gap-1.5">
            <span className={`font-bold ${isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900'}`}>
              {formatQuantityWithUnit(val, row.base_unit)}
            </span>
            {isOut && <Badge variant="danger">Out</Badge>}
            {isLow && <Badge variant="warning">Low</Badge>}
          </div>
        )
      },
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (val) => (
        <Badge variant={val ? 'success' : 'default'}>{val ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'id',
      label: 'Actions',
      render: (val, row) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/products/${val}/edit`)
            }}
          >
            Edit
          </Button>
          {isAdmin && row.is_active && (
            <Button
              size="sm"
              variant="danger"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteTarget(row)
              }}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              {meta.total} product{meta.total !== 1 ? 's' : ''} total in catalog
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/products/new')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Product
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by name, SKU, or barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="sm:w-56">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="block w-full rounded-xl border border-slate-200/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          data={products}
          isLoading={isLoading}
          onRowClick={(row) => navigate(`/products/${row.id}/edit`)}
          emptyMessage="No products found. Try adjusting your search or filters."
        />

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {meta.page} of {meta.total_pages} &mdash; {meta.total} results
            </p>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Deactivate Product"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to deactivate <span className="font-bold text-slate-900">&quot;{deleteTarget?.name}&quot;</span>?
            The product will be hidden from the POS but historical sales will be preserved.
          </p>
          <div className="flex gap-3 pt-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              isLoading={isDeleting}
              onClick={() => handleDelete(deleteTarget)}
            >
              Deactivate
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
