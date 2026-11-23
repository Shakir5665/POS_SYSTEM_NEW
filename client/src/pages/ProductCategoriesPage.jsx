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
          <p className="font-semibold text-gray-900">{val}</p>
          {row.description && (
            <p className="text-xs text-gray-500 line-clamp-1">{row.description}</p>
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {count} {count === 1 ? 'product' : 'products'}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => openEditModal(row)}
            title="Edit Category"
          >
            <svg className="w-4 h-4 text-gray-600 hover:text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="sr-only">Edit</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDeleteTarget(row)}
            title="Delete Category"
            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
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
            <h1 className="text-2xl font-bold text-gray-900">Product Categories</h1>
            <p className="text-sm text-gray-500 mt-1">
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
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4">
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
          <p className="text-xs text-gray-400">Total: {meta.total} categories</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <Table
            columns={columns}
            data={categories}
            loading={loading}
            emptyMessage="No product categories found."
          />
          {meta.total_pages > 1 && (
            <div className="p-4 border-t border-gray-100">
              <Pagination
                page={page}
                totalPages={meta.total_pages}
                onPageChange={(p) => setPage(p)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Category Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCategory ? 'Edit Product Category' : 'Create Product Category'}
      >
        <form onSubmit={handleSaveCategory} className="space-y-4">
          {formError && (
            <div className="p-3 bg-danger-50 text-danger-700 text-xs rounded-lg border border-danger-200">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Category Name <span className="text-danger-500">*</span>
            </label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Beverages, Electronics, Snacks"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Description (Optional)
            </label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optional notes or details about this product category..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Product Category"
      >
        <div className="space-y-4">
          <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg text-sm text-warning-800">
            <p className="font-semibold">Safe Unlinking Notice</p>
            <p className="text-xs mt-1">
              Deleting this category will <strong>NOT</strong> delete any products.
              {deleteTarget && (
                <span>
                  {' '}The <strong>{deleteTarget._count?.products ?? deleteTarget.product_count ?? 0} associated products</strong> will lose their category association and become unassigned.
                </span>
              )}
            </p>
          </div>

          <p className="text-sm text-gray-600">
            Are you sure you want to delete the category <strong>"{deleteTarget?.name}"</strong>?
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteCategory}
              isLoading={isDeleting}
            >
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
