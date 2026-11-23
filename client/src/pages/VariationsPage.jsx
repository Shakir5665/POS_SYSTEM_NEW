import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { variationsService } from '../services/variations'

export default function VariationsPage() {
  const [variations, setVariations] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVariation, setEditingVariation] = useState(null)
  const [name, setName] = useState('')
  const [values, setValues] = useState([])
  const [newValueInput, setNewValueInput] = useState('')
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchVariations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await variationsService.list({
        page,
        per_page: 15,
        search: search.trim() || undefined,
      })
      if (res.data?.meta) {
        setVariations(res.data.data || [])
        setMeta(res.data.meta)
      } else {
        const all = res.data?.data || []
        setVariations(all)
        setMeta({ page: 1, total_pages: 1, total: all.length })
      }
    } catch {
      toast.error('Failed to load variations')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchVariations()
  }, [fetchVariations])

  function openCreateModal() {
    setEditingVariation(null)
    setName('')
    setValues([])
    setNewValueInput('')
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(v) {
    setEditingVariation(v)
    setName(v.name || '')
    setValues((v.values || []).map((val) => (typeof val === 'string' ? val : val.value)))
    setNewValueInput('')
    setFormError('')
    setModalOpen(true)
  }

  function handleAddValue() {
    const val = newValueInput.trim()
    if (!val) return

    if (values.some((existing) => existing.toLowerCase() === val.toLowerCase())) {
      setFormError(`Value "${val}" already added`)
      return
    }

    setValues([...values, val])
    setNewValueInput('')
    setFormError('')
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddValue()
    }
  }

  function handleRemoveValue(index) {
    setValues(values.filter((_, idx) => idx !== index))
  }

  async function handleSaveVariation(e) {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Variation name is required')
      return
    }

    if (values.length === 0) {
      setFormError('At least one variation value is required (e.g. Small, Medium, Large)')
      return
    }

    setIsSubmitting(true)
    setFormError('')
    try {
      if (editingVariation) {
        await variationsService.update(editingVariation.id, {
          name: trimmedName,
          values,
        })
        toast.success(`Variation "${trimmedName}" updated successfully`)
      } else {
        await variationsService.create({
          name: trimmedName,
          values,
        })
        toast.success(`Variation "${trimmedName}" created successfully`)
      }
      setModalOpen(false)
      fetchVariations()
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message || 'Failed to save variation'
      setFormError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeleteVariation() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await variationsService.delete(deleteTarget.id)
      toast.success(`Variation "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      fetchVariations()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to delete variation')
    } finally {
      setIsDeleting(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Variation Name',
      render: (val) => <span className="font-semibold text-gray-900">{val}</span>,
    },
    {
      key: 'values',
      label: 'Variation Values',
      render: (vals) => {
        if (!vals || vals.length === 0) return <span className="text-gray-400">—</span>
        return (
          <div className="flex flex-wrap gap-1.5 py-1">
            {vals.map((v, i) => {
              const label = typeof v === 'string' ? v : v.value
              return (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-50 text-primary-700 border border-primary-200"
                >
                  {label}
                </span>
              )
            })}
          </div>
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
            title="Edit Variation"
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
            title="Delete Variation"
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
            <h1 className="text-2xl font-bold text-gray-900">Variations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage product variation attributes (e.g. Sizes, Colors, Materials) and their option values.
            </p>
          </div>
          <Button onClick={openCreateModal} className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Create Variation
          </Button>
        </div>

        {/* Search */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4">
          <div className="max-w-md w-full">
            <Input
              type="search"
              placeholder="Search variations by name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
            />
          </div>
          <p className="text-xs text-gray-400">Total: {meta.total} variations</p>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <Table
            columns={columns}
            data={variations}
            loading={loading}
            emptyMessage="No variations found."
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

      {/* Create / Edit Variation Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVariation ? 'Edit Variation' : 'Create Variation'}
      >
        <form onSubmit={handleSaveVariation} className="space-y-4">
          {formError && (
            <div className="p-3 bg-danger-50 text-danger-700 text-xs rounded-lg border border-danger-200">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Variation Name <span className="text-danger-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Size, Color, Flavor, Material"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
              Variation Values <span className="text-danger-500">*</span>
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                value={newValueInput}
                onChange={(e) => setNewValueInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter value (e.g. Small) and press Enter"
              />
              <Button type="button" variant="secondary" onClick={handleAddValue}>
                Add
              </Button>
            </div>

            {/* Chips Container */}
            <div className="min-h-[56px] p-2 bg-gray-50 border border-gray-200 rounded-lg flex flex-wrap gap-2 items-center">
              {values.length === 0 ? (
                <span className="text-xs text-gray-400 italic">
                  No values added yet. Type a value above and click Add or press Enter.
                </span>
              ) : (
                values.map((val, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-gray-300 rounded-full text-xs font-medium text-gray-800 shadow-xs"
                  >
                    <span>{val}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveValue(idx)}
                      className="text-gray-400 hover:text-danger-600 rounded-full p-0.5 hover:bg-danger-50 transition"
                      title="Remove"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-1">
              Press Enter or click Add to add values. Duplicate values are disallowed.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              {editingVariation ? 'Save Changes' : 'Create Variation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Variation"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete the variation <strong>"{deleteTarget?.name}"</strong> and all its option values?
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
              onClick={handleDeleteVariation}
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
