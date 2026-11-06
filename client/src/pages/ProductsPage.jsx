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
    productsService.categories()
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
          <img src={val} alt={row.name} className="w-10 h-10 rounded-lg object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
          <p className="font-medium text-gray-900">{val}</p>
          <p className="text-xs text-gray-400">{row.sku}</p>
        </div>
      ),
    },
    { key: 'sku', label: 'SKU' },
    {
      key: 'category',
      label: 'Category',
      render: (val) => val?.name ? <Badge variant="default">{val.name}</Badge> : <span className="text-gray-400">—</span>,
    },
    {
      key: 'price',
      label: 'Price',
      render: (val) => <span className="font-semibold text-gray-900">{formatCurrency(val)}</span>,
    },
    {
      key: 'cost_price',
      label: 'Cost Price',
      render: (val) => val ? formatCurrency(val) : <span className="text-gray-400">—</span>,
    },
    {
      key: 'quantity',
      label: 'Stock',
      render: (val, row) => {
        const isOut = val === 0
        const isLow = !isOut && val <= row.low_stock_threshold
        return (
          <div className="flex items-center gap-1.5">
            <span className={`font-semibold ${isOut ? 'text-danger-600' : isLow ? 'text-warning-600' : 'text-gray-900'}`}>
              {val}
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/products/${val}/edit`)}
          >
            Edit
          </Button>
          {isAdmin && row.is_active && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDeleteTarget(row)}
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
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {meta.total} product{meta.total !== 1 ? 's' : ''} total
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
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by name, SKU, or barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="sm:w-52">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table columns={columns} data={products} isLoading={isLoading} emptyMessage="No products found. Try adjusting your search or filters." />
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
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
          <p className="text-sm text-gray-600">
            Are you sure you want to deactivate <span className="font-semibold">"{deleteTarget?.name}"</span>?
            The product will be hidden from the POS but historical sales will be preserved.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
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
