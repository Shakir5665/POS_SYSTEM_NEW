import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { Badge } from '../components/Badge'
import { suppliersService } from '../services/suppliers'
import { formatCurrency, formatCompactCurrency } from '../utils/formatCurrency'

const EMPTY_SUPPLIER_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  contact_person: '',
  notes: '',
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Add / Edit Modal
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState(EMPTY_SUPPLIER_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  // Repayment Modal
  const [repaymentSupplier, setRepaymentSupplier] = useState(null)
  const [repaymentAmount, setRepaymentAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [repaymentSubmitting, setRepaymentSubmitting] = useState(false)

  // Statement Modal
  const [statementSupplier, setStatementSupplier] = useState(null)
  const [statementData, setStatementData] = useState(null)
  const [statementLoading, setStatementLoading] = useState(false)

  const fetchSuppliers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await suppliersService.list({ page, search: search.trim() || undefined, per_page: 20 })
      setSuppliers(res.data?.data || [])
      setMeta(res.data?.meta || { page: 1, total_pages: 1, total: 0 })
    } catch {
      toast.error('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  useEffect(() => {
    setPage(1)
  }, [search])

  // Stats calculation
  const totalPayables = suppliers.reduce((sum, s) => sum + Number(s.outstanding_debt || 0), 0)

  function openAddModal() {
    setEditTarget(null)
    setForm(EMPTY_SUPPLIER_FORM)
    setErrors({})
    setSupplierModalOpen(true)
  }

  function openEditModal(supplier) {
    setEditTarget(supplier)
    setForm({
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      contact_person: supplier.contact_person || '',
      notes: supplier.notes || '',
    })
    setErrors({})
    setSupplierModalOpen(true)
  }

  function validateSupplier() {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Supplier name is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSaveSupplier(e) {
    e.preventDefault()
    if (!validateSupplier()) return

    setSaving(true)
    try {
      if (editTarget) {
        await suppliersService.update(editTarget.id, form)
        toast.success('Supplier updated successfully')
      } else {
        await suppliersService.create(form)
        toast.success('Supplier registered successfully')
      }
      setSupplierModalOpen(false)
      fetchSuppliers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  function openRepaymentModal(supplier) {
    setRepaymentSupplier(supplier)
    setRepaymentAmount(String(supplier.outstanding_debt || ''))
    setPaymentMethod('CASH')
    setReference('')
    setNotes('')
  }

  async function handleRecordRepayment(e) {
    e.preventDefault()
    const amt = parseFloat(repaymentAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Please enter a valid repayment amount greater than 0')
      return
    }
    if (amt > Number(repaymentSupplier.outstanding_debt)) {
      toast.error(`Amount cannot exceed outstanding balance (${formatCurrency(repaymentSupplier.outstanding_debt)})`)
      return
    }

    setRepaymentSubmitting(true)
    try {
      await suppliersService.recordPayment(repaymentSupplier.id, {
        amount: amt,
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success('Supplier repayment recorded successfully')
      setRepaymentSupplier(null)
      fetchSuppliers()
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to record repayment')
    } finally {
      setRepaymentSubmitting(false)
    }
  }

  async function openStatementModal(supplier) {
    setStatementSupplier(supplier)
    setStatementLoading(true)
    try {
      const res = await suppliersService.statement(supplier.id)
      setStatementData(res.data?.data)
    } catch {
      toast.error('Failed to load supplier statement')
    } finally {
      setStatementLoading(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Supplier',
      render: (val, row) => (
        <div>
          <p className="font-semibold text-gray-900">{val}</p>
          {row.contact_person && (
            <p className="text-xs text-gray-500 mt-0.5">Contact: {row.contact_person}</p>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      label: 'Contact Info',
      render: (_, row) => (
        <div className="text-sm">
          {row.phone ? <p className="text-gray-900">{row.phone}</p> : <span className="text-gray-400">—</span>}
          {row.email && <p className="text-xs text-gray-400">{row.email}</p>}
        </div>
      ),
    },
    {
      key: 'address',
      label: 'Address',
      render: (val) => <span className="text-sm text-gray-600">{val || '—'}</span>,
    },
    {
      key: 'purchases',
      label: 'Orders',
      render: (_, row) => <Badge variant="secondary">{row._count?.purchases || 0} orders</Badge>,
    },
    {
      key: 'outstanding_debt',
      label: 'Payables Due',
      render: (val) => {
        const debt = Number(val || 0)
        return debt > 0 ? (
          <span className="font-bold text-danger-600">{formatCurrency(debt)}</span>
        ) : (
          <span className="text-success-600 font-medium">Nil</span>
        )
      },
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          {Number(row.outstanding_debt || 0) > 0 && (
            <Button size="sm" variant="success" onClick={() => openRepaymentModal(row)}>
              Pay Debt
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => openStatementModal(row)}>
            Statement
          </Button>
          <Button size="sm" variant="outline" onClick={() => openEditModal(row)}>
            Edit
          </Button>
        </div>
      ),
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage vendors, purchase debt, and account statements</p>
          </div>
          <Button variant="primary" onClick={openAddModal}>
            + Add Supplier
          </Button>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 font-medium">Total Suppliers</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{meta.total || suppliers.length}</p>
          </div>
          <div className="bg-danger-50 rounded-xl border border-danger-100 p-4">
            <p className="text-sm text-danger-700 font-medium">Total Payables Due</p>
            <p className="text-2xl font-bold text-danger-700 mt-1" title={formatCurrency(totalPayables)}>{formatCompactCurrency(totalPayables)}</p>
            <p className="text-xs text-danger-500 mt-0.5">Supplier debt to be settled</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm text-gray-500 font-medium">Active Vendors</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {suppliers.filter((s) => s.is_active).length}
            </p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-3 rounded-xl border border-gray-200 flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              role="searchbox"
              placeholder="Search by supplier name, contact person, phone, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white transition"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Suppliers Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <Table
            columns={columns}
            data={suppliers}
            isLoading={loading}
            emptyMessage="No suppliers found."
          />
        </div>

        {/* Pagination */}
        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.total_pages} &mdash; {meta.total} suppliers
            </p>
            <Pagination page={meta.page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={supplierModalOpen}
        onClose={() => setSupplierModalOpen(false)}
        title={editTarget ? 'Edit Supplier' : 'Register New Supplier'}
        size="md"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <Input
            label="Supplier / Business Name *"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Apex Wholesale Goods Ltd"
            error={errors.name}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Contact Person"
              value={form.contact_person}
              onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              placeholder="e.g. Kwame Mensah"
            />
            <Input
              label="Phone Number"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="e.g. 0241234567"
            />
          </div>
          <Input
            label="Email Address"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="e.g. orders@apexwholesale.com"
          />
          <Input
            label="Physical Address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="e.g. Warehouse 4, Tema Industrial Area"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Payment terms, delivery schedules, etc."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setSupplierModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={saving}>
              {editTarget ? 'Save Changes' : 'Register Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Debt Repayment Modal */}
      <Modal
        isOpen={!!repaymentSupplier}
        onClose={() => setRepaymentSupplier(null)}
        title="Pay Supplier Debt"
        size="sm"
      >
        {repaymentSupplier && (
          <form onSubmit={handleRecordRepayment} className="space-y-4">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-xs text-red-600 font-medium">Current Balance Due</p>
              <p className="text-2xl font-bold text-red-700 mt-0.5">
                {formatCurrency(repaymentSupplier.outstanding_debt)}
              </p>
              <p className="text-xs text-red-500 mt-1">
                Payments will be automatically allocated FIFO across the oldest unpaid orders.
              </p>
            </div>

            <Input
              label="Repayment Amount *"
              type="number"
              step="0.01"
              value={repaymentAmount}
              onChange={(e) => setRepaymentAmount(e.target.value)}
              placeholder="0.00"
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="CARD">Bank / Card Transfer</option>
              </select>
            </div>

            <Input
              label="Reference / Check / Receipt #"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. CHQ-88910 or MoMo Trans ID"
            />

            <Input
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Settlement for March shipments"
            />

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="secondary" type="button" onClick={() => setRepaymentSupplier(null)}>
                Cancel
              </Button>
              <Button variant="success" type="submit" isLoading={repaymentSubmitting}>
                Record Payment
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Supplier Statement of Account Modal */}
      <Modal
        isOpen={!!statementSupplier}
        onClose={() => { setStatementSupplier(null); setStatementData(null) }}
        title={`Statement of Account: ${statementSupplier?.name || ''}`}
        size="lg"
      >
        <div className="space-y-4">
          {statementLoading ? (
            <div className="py-12 text-center text-sm text-gray-500">Loading statement...</div>
          ) : statementData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div title={formatCurrency(statementData.summary.total_purchased)}>
                  <p className="text-xs text-gray-500">Total Invoiced</p>
                  <p className="text-base font-bold text-gray-900 mt-0.5">
                    {formatCompactCurrency(statementData.summary.total_purchased)}
                  </p>
                </div>
                <div title={formatCurrency(statementData.summary.total_paid)}>
                  <p className="text-xs text-gray-500">Total Settled</p>
                  <p className="text-base font-bold text-success-600 mt-0.5">
                    {formatCompactCurrency(statementData.summary.total_paid)}
                  </p>
                </div>
                <div title={formatCurrency(statementData.summary.current_balance)}>
                  <p className="text-xs text-gray-500">Current Balance Due</p>
                  <p className={`text-base font-bold mt-0.5 ${statementData.summary.current_balance > 0 ? 'text-danger-600' : 'text-gray-900'}`}>
                    {formatCompactCurrency(statementData.summary.current_balance)}
                  </p>
                </div>
              </div>

              {/* Statement Ledger Table */}
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Reference / Description</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Billed (Debit)</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Paid (Credit)</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {statementData.statement.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">
                          {new Date(row.date).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-gray-900">
                          <p className="font-medium text-xs">{row.reference}</p>
                          <p className="text-2xs text-gray-400">{row.description}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-900 font-mono text-xs">
                          {row.debit > 0 ? formatCurrency(row.debit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-success-600 font-mono text-xs">
                          {row.credit > 0 ? formatCurrency(row.credit) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-bold font-mono text-xs text-gray-900">
                          {formatCurrency(row.running_balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No statement history found.</p>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setStatementSupplier(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
