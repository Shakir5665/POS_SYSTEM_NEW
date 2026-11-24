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
    if (errors[name])
      setErrors((e) => {
        const n = { ...e }
        delete n[name]
        return n
      })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) {
      setErrors(errs)
      return
    }
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
        toast.success('Customer updated successfully')
      } else {
        await customersService.create(payload)
        toast.success('Customer created successfully')
      }
      closeModal()
      fetchCustomers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message ?? 'Failed to save customer')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Customer Name',
      render: (val, row) => (
        <span
          onClick={() => navigate(`/customers/${row.id}`)}
          className="font-bold text-slate-900 hover:text-primary-600 hover:underline cursor-pointer transition-colors"
        >
          {val}
        </span>
      ),
    },
    { key: 'phone', label: 'Phone', render: (v) => v || <span className="text-slate-400">—</span> },
    { key: 'email', label: 'Email', render: (v) => v || <span className="text-slate-400">—</span> },
    {
      key: 'outstanding_debt',
      label: 'Outstanding Debt',
      render: (val) => {
        const debt = Number(val || 0)
        return (
          <span className={`font-bold ${debt > 0 ? 'text-rose-600 font-mono' : 'text-slate-400'}`}>
            {debt > 0 ? formatCurrency(debt) : '—'}
          </span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">Manage customer accounts, sales history, and credit balances.</p>
          </div>
          <Button variant="primary" onClick={openAdd} className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </Button>
        </div>

        {/* Search */}
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm flex items-center justify-between gap-4">
          <div className="max-w-md w-full">
            <Input
              type="search"
              placeholder="Search by name, phone, or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="text-xs font-medium text-slate-400">Total: {customers.length} on page</p>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          data={customers}
          isLoading={loading}
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
          emptyMessage="No customers found. Try adjusting your search."
        />

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {page} of {meta.total_pages}
            </p>
            <Pagination page={page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editTarget ? 'Edit Customer' : 'Add Customer'}>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Full Name *"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="e.g. Jane Doe"
            error={errors.name}
            autoFocus
          />
          <Input
            label="Phone"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            placeholder="e.g. 0244123456"
          />
          <Input
            label="Email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="e.g. jane@example.com"
          />
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Address</label>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              rows={2}
              placeholder="e.g. 12 High Street, Accra"
              className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" type="button" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              {editTarget ? 'Save Changes' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  )
}
