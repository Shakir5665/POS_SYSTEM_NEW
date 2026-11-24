import { useState, useEffect, useCallback } from 'react'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { warehouseService } from '../services/warehouses'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { useAuth } from '../hooks/useAuth'
import toast from 'react-hot-toast'

export default function WarehousesPage() {
  const { user } = useAuth()
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER'

  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    address: '',
    is_default: false,
    is_active: true,
  })
  const [formErrors, setFormErrors] = useState({})

  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true)
      const params = {}
      if (activeFilter === 'active') params.is_active = true
      if (activeFilter === 'inactive') params.is_active = false
      const { data } = await warehouseService.list(params)
      setWarehouses(data.data || [])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load warehouses')
    } finally {
      setLoading(false)
    }
  }, [activeFilter])

  useEffect(() => {
    fetchWarehouses()
  }, [fetchWarehouses])

  const filteredWarehouses = warehouses.filter((wh) => {
    const q = search.toLowerCase()
    return wh.name.toLowerCase().includes(q) || wh.code.toLowerCase().includes(q)
  })

  function openCreate() {
    setFormData({
      code: '',
      name: '',
      address: '',
      is_default: false,
      is_active: true,
    })
    setFormErrors({})
    setIsCreateOpen(true)
  }

  function openEdit(wh) {
    setSelectedWarehouse(wh)
    setFormData({
      code: wh.code,
      name: wh.name,
      address: wh.address || '',
      is_default: wh.is_default,
      is_active: wh.is_active,
    })
    setFormErrors({})
    setIsEditOpen(true)
  }

  function openDetail(wh) {
    setSelectedWarehouse(wh)
    setIsDetailOpen(true)
  }

  function validateForm() {
    const errors = {}
    if (!formData.code.trim()) errors.code = 'Warehouse code is required'
    if (!formData.name.trim()) errors.name = 'Warehouse name is required'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!validateForm()) return

    try {
      setSubmitting(true)
      await warehouseService.create({
        ...formData,
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        address: formData.address.trim() || null,
      })
      toast.success('Warehouse created successfully')
      setIsCreateOpen(false)
      fetchWarehouses()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to create warehouse'
      toast.error(msg)
      if (msg.includes('code') || msg.includes('Code')) {
        setFormErrors((prev) => ({ ...prev, code: msg }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(e) {
    e.preventDefault()
    if (!validateForm()) return

    try {
      setSubmitting(true)
      await warehouseService.update(selectedWarehouse.id, {
        ...formData,
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        address: formData.address.trim() || null,
      })
      toast.success('Warehouse updated successfully')
      setIsEditOpen(false)
      fetchWarehouses()
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error?.message || 'Failed to update warehouse'
      toast.error(msg)
      if (msg.includes('code') || msg.includes('Code')) {
        setFormErrors((prev) => ({ ...prev, code: msg }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(wh) {
    try {
      await warehouseService.update(wh.id, { is_active: !wh.is_active })
      toast.success(`Warehouse "${wh.name}" ${wh.is_active ? 'deactivated' : 'activated'}`)
      fetchWarehouses()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update warehouse status')
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Warehouse Management</h1>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Configure physical locations and assign transaction attribution
            </p>
          </div>
          {isAdminOrManager && (
            <Button onClick={openCreate} className="shadow-2xs">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Warehouse
            </Button>
          )}
        </div>

        {/* Global Authoritative Rule Banner */}
        <div className="bg-blue-50/80 backdrop-blur-md border border-blue-200/80 p-4 rounded-2xl shadow-2xs">
          <div className="flex items-start">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 text-xs text-blue-900 leading-relaxed">
              <p className="font-bold tracking-tight">Authoritative Inventory Balance Architecture</p>
              <p className="mt-1 text-blue-800">
                NexTill utilizes <code className="bg-blue-100/90 text-blue-900 px-1.5 py-0.5 rounded-md font-mono text-2xs font-semibold">Product.quantity</code> as the authoritative global inventory balance. Warehouse attribution connects sales, purchase orders, returns, and stock adjustments to locations for audit and reporting without partitioning physical balances.
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Search & Filters */}
        <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-white/90 shadow-glass-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/90 border border-slate-200/90 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all placeholder:text-slate-400"
            />
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-900 bg-white/90 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 transition-all"
            >
              <option value="all">All Warehouses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white/85 backdrop-blur-md shadow-2xs">
          {loading ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Loading warehouses...</span>
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="font-bold text-slate-700 text-sm">No warehouses found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-slate-100 text-xs">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                  <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3.5 text-center font-semibold text-slate-500 uppercase tracking-wider">Default</th>
                  <th className="px-6 py-3.5 text-center font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3.5 text-right font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/90 bg-white/60">
                {filteredWarehouses.map((wh) => (
                  <tr key={wh.id} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-slate-900">{wh.code}</td>
                    <td className="px-6 py-4 font-semibold text-slate-800">{wh.name}</td>
                    <td className="px-6 py-4 text-slate-500 max-w-xs truncate">
                      {wh.address || <span className="text-slate-300 italic">No address provided</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {wh.is_default ? (
                        <Badge variant="primary">Default</Badge>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      {wh.is_active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="default">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right space-x-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetail(wh)}
                        title="View details"
                      >
                        View
                      </Button>
                      {isAdminOrManager && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => openEdit(wh)}>
                            Edit
                          </Button>
                          {!wh.is_default && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={
                                wh.is_active
                                  ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                                  : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }
                              onClick={() => handleToggleActive(wh)}
                            >
                              {wh.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal: Create Warehouse */}
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Warehouse">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Warehouse Code *</label>
              <input
                type="text"
                required
                placeholder="e.g. WH-002"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`w-full font-mono uppercase px-3.5 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90 ${
                  formErrors.code ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                }`}
              />
              {formErrors.code && <p className="text-xs text-rose-600 mt-1">{formErrors.code}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Warehouse Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. North Distribution Hub"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3.5 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90 ${
                  formErrors.name ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                }`}
              />
              {formErrors.name && <p className="text-xs text-rose-600 mt-1">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Physical Address</label>
              <textarea
                rows={2}
                placeholder="Street address, city, region..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3.5 py-2 border border-slate-200/90 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90"
              />
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Designate as Default Warehouse
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                Save Warehouse
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Edit Warehouse */}
        <Modal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} title={`Edit Warehouse: ${selectedWarehouse?.name}`}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Warehouse Code *</label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`w-full font-mono uppercase px-3.5 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90 ${
                  formErrors.code ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                }`}
              />
              {formErrors.code && <p className="text-xs text-rose-600 mt-1">{formErrors.code}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Warehouse Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3.5 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90 ${
                  formErrors.name ? 'border-rose-400 bg-rose-50/50' : 'border-slate-200/90'
                }`}
              />
              {formErrors.name && <p className="text-xs text-rose-600 mt-1">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Physical Address</label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3.5 py-2 border border-slate-200/90 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-600 bg-white/90"
              />
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Designate as Default Warehouse
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100">
              <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={submitting}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>

        {/* Modal: Warehouse Detail View */}
        <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Warehouse Details">
          {selectedWarehouse && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Warehouse Code</p>
                  <p className="font-mono font-bold text-slate-900 mt-1">{selectedWarehouse.code}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Default Status</p>
                  <p className="mt-1">
                    {selectedWarehouse.is_default ? (
                      <Badge variant="primary">Default Location</Badge>
                    ) : (
                      <span className="text-xs text-slate-500 font-medium">Standard Warehouse</span>
                    )}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase">Warehouse Name</p>
                  <p className="font-bold text-slate-900 mt-1">{selectedWarehouse.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 font-semibold uppercase">Physical Address</p>
                  <p className="text-slate-700 mt-1 text-xs">{selectedWarehouse.address || 'No physical address provided'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Status</p>
                  <p className="mt-1">
                    {selectedWarehouse.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold uppercase">Registered</p>
                  <p className="text-slate-700 text-xs mt-1">{new Date(selectedWarehouse.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-800">
                <strong>Inventory Note:</strong> Product stock balances are global (<code className="font-mono font-semibold">Product.quantity</code>). All items recorded under transactions with this warehouse are stored in the shared inventory database.
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </DashboardLayout>
  )
}
