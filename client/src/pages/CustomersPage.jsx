import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { customersService } from '../services/customers'
import { formatCurrency } from '../utils/formatCurrency'

const EMPTY_FORM = { name: '', phone: '', email: '', address: '' }

function validate(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Name is required'
  return errors
}

export default function CustomersPage() {
  const navigate = useNavigate()

  const [customers, setCustomers] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const fetchCustomers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await customersService.list({ page, search: search || undefined, per_page: 20 })
      setCustomers(res.data?.data ?? res.data ?? [])
      setMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load customers')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchCustomers()
  }, [fetchCustomers])

  // Reset page on search change
  useEffect(() => {
    setPage(1)
  }, [search])

  function openAdd() {
    setEditTarget(null)
    setForm(EMPTY_FORM)
    setErrors({})
    setModalOpen(true)
  }

  function openEdit(customer) {
    setEditTarget(customer)
    setForm({
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
    })
    setErrors({})
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
    if (errors[name]) setErrors((e) => { const n = { ...e }; delete n[name]; return n })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      }
      if (editTarget) {
        await customersService.update(editTarget.id, payload)
        toast.success('Customer updated')
      } else {
        await customersService.create(payload)
        toast.success('Customer added')
      }
      closeModal()
      fetchCustomers()
    } catch (err) {
      const msg = err?.response?.data?.error?.message ?? 'Failed to save customer'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    { key: 'name', label: 'Name', render: (v) => <span className="font-medium text-gray-900">{v}</span> },
    { key: 'phone', label: 'Phone', render: (v) => v ?? <span className="text-gray-400">—</span> },
    { key: 'email', label: 'Email', render: (v) => v ?? <span className="text-gray-400">—</span> },
    {
      key: 'loyalty_points',
      label: 'Loyalty Points',
      render: (v) => (
        <span className="inline-flex items-center gap-1 text-primary-700 font-medium">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          {v ?? 0}
        </span>
      ),
    },
    {
      key: 'total_purchases',
      label: 'Total Purchases',
      render: (v) => v != null ? formatCurrency(v) : <span className="text-gray-400">—</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${row.id}`)}>
            View
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openEdit(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
            <p className="text-sm text-gray-500 mt-1">Manage customer accounts and loyalty points</p>
          </div>
          <Button onClick={openAdd}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </Button>
        </div>

        {/* Search */}
        <div className="max-w-sm">
          <Input
            placeholder="Search by name, phone, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <Table columns={columns} data={customers} isLoading={loading} emptyMessage="No customers found." />
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex justify-end">
            <Pagination page={meta.page ?? page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editTarget ? 'Edit Customer' : 'Add Customer'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Full Name *"
            name="name"
            value={form.name}
            onChange={handleChange}
            error={errors.name}
            placeholder="e.g. Kwame Asante"
            autoFocus
          />
          <Input
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            error={errors.phone}
            placeholder="e.g. 024-456-7890"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            error={errors.email}
            placeholder="e.g. kwame@example.com"
          />
          <Input
            label="Address"
            name="address"
            value={form.address}
            onChange={handleChange}
            error={errors.address}
            placeholder="e.g. Accra, Ghana"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {editTarget ? 'Save Changes' : 'Add Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}
