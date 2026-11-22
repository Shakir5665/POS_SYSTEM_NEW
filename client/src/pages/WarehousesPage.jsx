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
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Warehouse Management</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure physical locations and assign transaction attribution
            </p>
          </div>
          {isAdminOrManager && (
            <Button onClick={openCreate} className="shadow-sm">
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Warehouse
            </Button>
          )}
        </div>

        {/* Global Authoritative Rule Banner */}
        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg shadow-sm">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3 text-sm text-blue-700">
              <p className="font-semibold">Authoritative Inventory Balance Architecture</p>
              <p className="mt-0.5">
                NexTill utilizes <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-xs">Product.quantity</code> as the authoritative global inventory balance. Warehouse attribution connects sales, purchase orders, returns, and stock adjustments to locations for audit and reporting without partitioning physical balances.
              </p>
            </div>
          </div>
        </div>

        {/* Controls: Search & Filters */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
            <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-medium text-gray-500 uppercase">Status:</span>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="all">All Warehouses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="animate-spin h-8 w-8 text-primary-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Loading warehouses...</span>
            </div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="font-medium text-gray-700">No warehouses found</p>
              <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Code</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-3.5 text-left font-semibold text-gray-700">Address</th>
                    <th className="px-6 py-3.5 text-center font-semibold text-gray-700">Default</th>
                    <th className="px-6 py-3.5 text-center font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-3.5 text-right font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filteredWarehouses.map((wh) => (
                    <tr key={wh.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium text-gray-900">
                        {wh.code}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-800">
                        {wh.name}
                      </td>
                      <td className="px-6 py-4 text-gray-500 max-w-xs truncate">
                        {wh.address || <span className="text-gray-300 italic">No address provided</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {wh.is_default ? (
                          <Badge variant="primary">Default</Badge>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {wh.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="default">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
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
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => openEdit(wh)}
                            >
                              Edit
                            </Button>
                            {!wh.is_default && (
                              <Button
                                size="sm"
                                variant={wh.is_active ? 'ghost' : 'ghost'}
                                className={wh.is_active ? 'text-danger-600 hover:text-danger-700' : 'text-success-600 hover:text-success-700'}
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
            </div>
          )}
        </div>

        {/* Modal: Create Warehouse */}
        <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create New Warehouse">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Warehouse Code *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. WH-002"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`w-full font-mono uppercase px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${
                  formErrors.code ? 'border-danger-500 focus:border-danger-500' : 'border-gray-300'
                }`}
              />
              {formErrors.code && <p className="text-xs text-danger-600 mt-1">{formErrors.code}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Warehouse Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. North Distribution Hub"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${
                  formErrors.name ? 'border-danger-500 focus:border-danger-500' : 'border-gray-300'
                }`}
              />
              {formErrors.name && <p className="text-xs text-danger-600 mt-1">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Physical Address
              </label>
              <textarea
                rows={2}
                placeholder="Street address, city, region..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Designate as Default Warehouse
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Warehouse Code *
              </label>
              <input
                type="text"
                required
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                className={`w-full font-mono uppercase px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${
                  formErrors.code ? 'border-danger-500 focus:border-danger-500' : 'border-gray-300'
                }`}
              />
              {formErrors.code && <p className="text-xs text-danger-600 mt-1">{formErrors.code}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Warehouse Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500 ${
                  formErrors.name ? 'border-danger-500 focus:border-danger-500' : 'border-gray-300'
                }`}
              />
              {formErrors.name && <p className="text-xs text-danger-600 mt-1">{formErrors.name}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Physical Address
              </label>
              <textarea
                rows={2}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Designate as Default Warehouse
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 h-4 w-4"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
                <div>
                  <p className="text-xs text-gray-500">Warehouse Code</p>
                  <p className="font-mono font-semibold text-gray-900 mt-0.5">{selectedWarehouse.code}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Default Status</p>
                  <p className="mt-0.5">
                    {selectedWarehouse.is_default ? (
                      <Badge variant="primary">Default Location</Badge>
                    ) : (
                      <span className="text-xs text-gray-500 font-medium">Standard Warehouse</span>
                    )}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Warehouse Name</p>
                  <p className="font-semibold text-gray-900 mt-0.5">{selectedWarehouse.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Physical Address</p>
                  <p className="text-gray-800 mt-0.5">{selectedWarehouse.address || 'No physical address provided'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="mt-0.5">
                    {selectedWarehouse.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="default">Inactive</Badge>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Registered</p>
                  <p className="text-gray-800 text-xs mt-0.5">{new Date(selectedWarehouse.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                <strong>Inventory Note:</strong> Product stock balances are global (<code className="font-mono">Product.quantity</code>). All items recorded under transactions with this warehouse are stored in the shared inventory database.
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
