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
import { formatCurrency} from '../utils/formatCurrency'

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
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        contact_person: form.contact_person.trim() || null,
        notes: form.notes.trim() || null,
      }

      if (editTarget) {
        await suppliersService.update(editTarget.id, payload)
        toast.success(`Supplier "${payload.name}" updated successfully`)
      } else {
        await suppliersService.create(payload)
        toast.success(`Supplier "${payload.name}" created successfully`)
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
    setRepaymentAmount('')
    setPaymentMethod('CASH')
    setReference('')
    setNotes('')
  }

  async function handleConfirmRepayment(e) {
    e.preventDefault()
    const amt = parseFloat(repaymentAmount)
    if (isNaN(amt) || amt <= 0) {
      toast.error('Enter a valid payment amount greater than zero')
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
      toast.success(`Repayment of ${formatCurrency(amt)} recorded successfully`)
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
      setStatementData(res.data?.data || null)
    } catch {
      toast.error('Failed to load supplier statement')
    } finally {
      setStatementLoading(false)
    }
  }

  const columns = [
    {
      key: 'name',
      label: 'Supplier Name',
      render: (val, row) => (
        <div>
          <p className="font-bold text-slate-900">{val}</p>
          {row.contact_person && (
            <p className="text-xs text-slate-400 mt-0.5">Contact: {row.contact_person}</p>
          )}
        </div>
      ),
    },
    { key: 'phone', label: 'Phone', render: (v) => v || <span className="text-slate-400">—</span> },
    { key: 'email', label: 'Email', render: (v) => v || <span className="text-slate-400">—</span> },
    {
      key: 'outstanding_debt',
      label: 'Payables (Owed)',
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
          {Number(row.outstanding_debt || 0) > 0 && (
            <Button size="sm" variant="primary" onClick={() => openRepaymentModal(row)}>
              Pay
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => openStatementModal(row)}>
            Statement
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openEditModal(row)}>
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
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Suppliers</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">Manage vendor contacts, accounts, and supplier payables.</p>
          </div>
          <Button variant="primary" onClick={openAddModal} className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Supplier
          </Button>
        </div>

        {/* KPI & Search Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-white/90 shadow-glass-sm p-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Payables</p>
              <p className="text-xl font-bold text-rose-600 mt-1">{formatCurrency(totalPayables)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          <div className="md:col-span-3 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm flex items-center justify-between gap-4">
            <div className="max-w-md w-full">
              <Input
                type="search"
                placeholder="Search suppliers by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="text-xs font-medium text-slate-400">Total: {meta.total} suppliers</p>
          </div>
        </div>

        {/* Table */}
        <Table
          columns={columns}
          data={suppliers}
          isLoading={loading}
          emptyMessage="No suppliers found."
        />

        {meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-medium text-slate-500">
              Page {page} of {meta.total_pages} &mdash; {meta.total} suppliers
            </p>
            <Pagination page={page} total_pages={meta.total_pages} onPageChange={setPage} />
          </div>
        )}
      </div>

      {/* Add / Edit Supplier Modal */}
      <Modal isOpen={supplierModalOpen} onClose={() => setSupplierModalOpen(false)} title={editTarget ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          <Input
            label="Supplier Name *"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. ABC Beverages Ltd."
            error={errors.name}
            autoFocus
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={form.contact_person}
              onChange={(e) => setForm((prev) => ({ ...prev, contact_person: e.target.value }))}
              placeholder="e.g. John Smith"
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="e.g. 0244123456"
            />
          </div>
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="e.g. info@supplier.com"
          />
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Address</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              rows={2}
              placeholder="Physical warehouse/office location"
              className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
            />
          </div>
          <div className="flex justify-end gap-2.5 pt-2">
            <Button variant="secondary" type="button" onClick={() => setSupplierModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={saving}>
              {editTarget ? 'Save Changes' : 'Create Supplier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Repayment Modal */}
      {repaymentSupplier && (
        <Modal isOpen={!!repaymentSupplier} onClose={() => setRepaymentSupplier(null)} title={`Record Payment to ${repaymentSupplier.name}`} size="md">
          <form onSubmit={handleConfirmRepayment} className="space-y-4">
            <div className="bg-rose-50/80 border border-rose-100 rounded-xl p-3 flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-rose-700 uppercase">Outstanding Balance Owed</p>
                <p className="text-xl font-bold text-rose-800">{formatCurrency(repaymentSupplier.outstanding_debt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setRepaymentAmount(String(repaymentSupplier.outstanding_debt))}
                className="text-xs bg-white border border-rose-200 text-rose-700 px-2.5 py-1 rounded-lg font-bold hover:bg-rose-50 transition"
              >
                Pay Full Balance
              </button>
            </div>

            <Input
              label="Payment Amount *"
              type="number"
              step="any"
              value={repaymentAmount}
              onChange={(e) => setRepaymentAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
            />

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">Payment Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-slate-200/90 bg-white/90 px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600"
              >
                <option value="CASH">Cash</option>
                <option value="MOBILE_MONEY">Mobile Money</option>
                <option value="BANK_TRANSFER">Bank Transfer / Cheque</option>
              </select>
            </div>

            <Input
              label="Reference / Check #"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Cheque # or Bank ref"
            />

            <div className="flex justify-end gap-2.5 pt-2">
              <Button variant="secondary" type="button" onClick={() => setRepaymentSupplier(null)} disabled={repaymentSubmitting}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" isLoading={repaymentSubmitting}>
                Confirm Payment
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Statement Modal */}
      {statementSupplier && (
        <Modal isOpen={!!statementSupplier} onClose={() => setStatementSupplier(null)} title={`Supplier Statement — ${statementSupplier.name}`} size="lg">
          <div className="space-y-4">
            {statementLoading ? (
              <p className="text-xs text-slate-400 py-6 text-center">Loading statement data...</p>
            ) : statementData ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                  <span className="text-xs font-semibold text-slate-600">Total Outstanding Balance</span>
                  <span className="text-base font-bold text-rose-600">{formatCurrency(statementData.outstanding_debt || 0)}</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left font-semibold text-slate-500 uppercase border-b border-slate-100">
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Ref</th>
                        <th className="pb-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(statementData.transactions || []).map((t, i) => (
                        <tr key={i}>
                          <td className="py-2 text-slate-600">{new Date(t.date).toLocaleDateString()}</td>
                          <td className="py-2"><Badge variant={t.type === 'PAYMENT' ? 'success' : 'default'}>{t.type}</Badge></td>
                          <td className="py-2 font-mono text-slate-500">{t.reference || '—'}</td>
                          <td className="py-2 text-right font-bold text-slate-900">{formatCurrency(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">No transaction records found</p>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setStatementSupplier(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DashboardLayout>
  )
}
