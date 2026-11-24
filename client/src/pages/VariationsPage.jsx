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
      const res = await variationsService.delete(deleteTarget.id)
      const count = res.data?.data?.affected_products || 0
      toast.success(
        `Variation "${deleteTarget.name}" deleted. ${count > 0 ? `${count} products unlinked.` : ''}`
      )
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
      render: (val) => <span className="font-bold text-slate-900">{val}</span>,
    },
    {
      key: 'values',
      label: 'Values',
      render: (val) => {
        const list = (val || []).map((v) => (typeof v === 'string' ? v : v.value))
        return (
          <div className="flex flex-wrap gap-1.5 max-w-md">
            {list.map((v, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-indigo-50/80 text-indigo-700 border border-indigo-200/60"
              >
                {v}
              </span>
            ))}
          </div>
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
            title="Edit Variation"
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
            title="Delete Variation"
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Product Variations</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Configure product attributes and option matrices (e.g. Size, Color, Volume).
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
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm flex items-center justify-between gap-4">
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
          <p className="text-xs font-medium text-slate-400">Total: {meta.total} variations</p>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          data={variations}
          isLoading={loading}
          emptyMessage="No product variations configured."
        />

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {page} of {meta.total_pages} &mdash; {meta.total} variations
            </p>
            <Pagination
              page={page}
              total_pages={meta.total_pages}
              onPageChange={(p) => setPage(p)}
            />
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVariation ? 'Edit Product Variation' : 'Create Product Variation'}
      >
        <form onSubmit={handleSaveVariation} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs font-medium rounded-xl border border-rose-200">
              {formError}
            </div>
          )}

          <Input
            label="Variation Name *"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setFormError('')
            }}
            placeholder="e.g. Size, Color, Flavor"
            autoFocus
          />

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Add Values *</label>
            <div className="flex gap-2">
              <Input
                value={newValueInput}
                onChange={(e) => setNewValueInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter value (e.g. Small) and press Enter"
                className="flex-1"
              />
              <Button type="button" variant="secondary" onClick={handleAddValue}>
                Add
              </Button>
            </div>
          </div>

          {values.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Configured Values ({values.length}):</p>
              <div className="flex flex-wrap gap-2 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80">
                {values.map((v, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 shadow-2xs text-slate-800"
                  >
                    <span>{v}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveValue(idx)}
                      className="text-slate-400 hover:text-rose-600 transition"
                      title="Remove value"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              {editingVariation ? 'Update Variation' : 'Create Variation'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Variation"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Are you sure you want to delete variation{' '}
            <strong className="text-slate-900">&quot;{deleteTarget?.name}&quot;</strong>?
          </p>
          <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-800">
            <p className="font-bold">Notice:</p>
            <p className="mt-1 leading-relaxed">
              Deleting this variation will unassign it from existing products without deleting any products.
            </p>
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDeleteVariation} isLoading={isDeleting}>
              Delete Variation
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
