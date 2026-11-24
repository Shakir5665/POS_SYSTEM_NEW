import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { productsService } from '../services/products'

export default function ProductCategoriesPage() {
  const [categories, setCategories] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    try {
      const res = await productsService.categories({
        page,
        per_page: 15,
        search: search.trim() || undefined,
      })
      if (res.data?.meta) {
        setCategories(res.data.data || [])
        setMeta(res.data.meta)
      } else {
        const all = res.data?.data || []
        setCategories(all)
        setMeta({ page: 1, total_pages: 1, total: all.length })
      }
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  function openCreateModal() {
    setEditingCategory(null)
    setFormName('')
    setFormDescription('')
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(cat) {
    setEditingCategory(cat)
    setFormName(cat.name || '')
    setFormDescription(cat.description || '')
    setFormError('')
    setModalOpen(true)
  }

  async function handleSaveCategory(e) {
    e.preventDefault()
    const name = formName.trim()
    if (!name) {
      setFormError('Category name is required')
      return
    }

    setIsSubmitting(true)
    setFormError('')
    try {
      if (editingCategory) {
        await productsService.updateCategory(editingCategory.id, {
          name,
          description: formDescription.trim() || null,
        })
        toast.success(`Category "${name}" updated successfully`)
      } else {
        await productsService.createCategory({
          name,
          description: formDescription.trim() || null,
        })
        toast.success(`Category "${name}" created successfully`)
      }
      setModalOpen(false)
      fetchCategories()
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save category'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteCategory() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await productsService.deleteCategory(deleteTarget.id)
      const count = res.data?.data?.affected_products || 0
      toast.success(
        `Category "${deleteTarget.name}" deleted. ${count > 0 ? `${count} products unlinked.` : ''}`
      )
      setDeleteTarget(null)
      fetchCategories()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete category')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Category Name',
      render: (val, row) => (
        <div>
          <p className="font-bold text-slate-900">{val}</p>
          {row.description && (
            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{row.description}</p>
          )}
        </div>
      ),
    },
    {
      key: '_count',
      label: 'Product Count',
      render: (val, row) => {
        const count = val?.products ?? row.product_count ?? 0
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
            {count} {count === 1 ? 'product' : 'products'}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openEditModal(row)}
            title="Edit Category"
          >
            <svg className="w-4 h-4 text-slate-500 hover:text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteTarget(row)}
            title="Delete Category"
            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span className="sr-only">Delete</span>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Product Categories</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Organize products into hierarchical or grouped catalog categories.
            </p>
          </div>
          <Button onClick={openCreateModal} className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Category
          </Button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm flex items-center justify-between gap-4">
          <div className="max-w-md w-full">
            <Input
              type="search"
              placeholder="Search categories by name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <p className="text-xs font-medium text-slate-400">Total: {meta.total} categories</p>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          data={categories}
          isLoading={loading}
          emptyMessage="No product categories found."
        />

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {page} of {meta.total_pages} &mdash; {meta.total} categories
            </p>
            <Pagination
              page={page}
              total_pages={meta.total_pages}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Create / Edit Category Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Product Category' : 'Create Product Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs font-medium rounded-xl border border-rose-200">
              {formError}
            </div>
          )}

          <Input
            label="Category Name *"
            value={formName}
            onChange={(e) => {
              setFormName(e.target.value)
              setFormError('')
            }}
            placeholder="e.g. Beverages, Electronics"
            autoFocus
          />

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Description (Optional)</label>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Short description for this category..."
              rows={3}
              className="block w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingCategory ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Category"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Are you sure you want to delete category{' '}
            <strong className="text-slate-900">&quot;{deleteTarget?.name}&quot;</strong>?
          </p>
          {Number(deleteTarget?.product_count || 0) > 0 ? (
            <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-800">
              <p className="font-bold">Associated Products Protection:</p>
              <p className="mt-1 leading-relaxed">
                This category currently has <strong>{deleteTarget.product_count} associated products</strong>. Deleting this category will NOT delete the products; their category will simply be set to Unassigned.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              This action cannot be undone. Are you sure you want to proceed?
            </p>
          )}
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteCategory} isLoading={isDeleting}>
              Delete Category
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
