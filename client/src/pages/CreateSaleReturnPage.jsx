import { useState, useEffect, useId } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { salesService } from '../services/sales'
import { returnsService } from '../services/returns'
import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'

export default function CreateSaleReturnPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialSaleId = searchParams.get('saleId') || ''
  const settings = useSettings()
  const fmt = (v) => formatCurrency(v, settings.currency_symbol || 'LKR')

  // Search & Sales lookup
  const [saleSearch, setSaleSearch] = useState('')
  const [salesList, setSalesList] = useState([])
  const [searchingSales, setSearchingSales] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState(initialSaleId)

  // Eligibility data
  const [eligibility, setEligibility] = useState(null)
  const [loadingEligibility, setLoadingEligibility] = useState(false)

  // Return items configuration: [{ sale_item_id, product_name, sku, unit, sold_quantity, already_returned, remaining_eligible, net_unit_price, return_qty, restock, disposition }]
  const [returnItems, setReturnItems] = useState([])
  const [reason, setReason] = useState('')
  const [refundMethod, setRefundMethod] = useState('CASH')
  const [notes, setNotes] = useState('')

  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Load initial sales list for selection
  useEffect(() => {
    async function searchSales() {
      setSearchingSales(true)
      try {
        const res = await salesService.list({ per_page: 15, search: saleSearch.trim() || undefined })
        setSalesList(res.data?.data || [])
      } catch {
        // Silently handle
      } finally {
        setSearchingSales(false)
      }
    }
    const timer = setTimeout(searchSales, 300)
    return () => clearTimeout(timer)
  }, [saleSearch])

  // When selectedSaleId changes, load eligibility
  useEffect(() => {
    if (!selectedSaleId) {
      setEligibility(null)
      setReturnItems([])
      return
    }

    async function loadEligibility() {
      setLoadingEligibility(true)
      try {
        const res = await returnsService.getSaleEligibility(selectedSaleId)
        const data = res.data?.data
        setEligibility(data)

        if (data?.items) {
          setReturnItems(
            data.items.map((it) => ({
              sale_item_id: it.sale_item_id,
              product_id: it.product_id,
              product_name: it.product_name,
              sku: it.product_sku,
              unit: it.unit,
              sold_quantity: Number(it.sold_quantity),
              already_returned: Number(it.already_returned),
              remaining_eligible: Number(it.remaining_eligible),
              net_unit_price: Number(it.net_unit_price),
              return_qty: 0,
              restock: true,
              disposition: 'RESTOCKED',
            }))
          )
        }
      } catch (err) {
        toast.error(err.response?.data?.error?.message || 'Failed to load sale eligibility')
        setEligibility(null)
      } finally {
        setLoadingEligibility(false)
      }
    }

    loadEligibility()
  }, [selectedSaleId])

  function handleReturnQtyChange(saleItemId, rawVal) {
    const parsed = parseFloat(rawVal)
    const val = isNaN(parsed) || parsed < 0 ? 0 : parsed

    setReturnItems((prev) =>
      prev.map((it) => {
        if (it.sale_item_id !== saleItemId) return it
        const bounded = Math.min(val, it.remaining_eligible)
        return { ...it, return_qty: bounded }
      })
    )
  }

  function handleRestockToggle(saleItemId, checked) {
    setReturnItems((prev) =>
      prev.map((it) => {
        if (it.sale_item_id !== saleItemId) return it
        return {
          ...it,
          restock: checked,
          disposition: checked ? 'RESTOCKED' : 'DAMAGED',
        }
      })
    )
  }

  // Calculations
  const activeItemsToReturn = returnItems.filter((it) => it.return_qty > 0)
  const totalItemsCount = activeItemsToReturn.reduce((sum, it) => sum + it.return_qty, 0)
  const calculatedRefundTotal = activeItemsToReturn.reduce(
    (sum, it) => sum + it.return_qty * it.net_unit_price,
    0
  )

  async function handleProcessReturn() {
    if (activeItemsToReturn.length === 0) {
      toast.error('Please specify a return quantity for at least one item')
      return
    }

    if (!reason.trim()) {
      toast.error('Return reason is required')
      return
    }

    setIsSubmitting(true)
    try {
      const idempotencyKey = `SR-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      const payload = {
        sale_id: selectedSaleId,
        reason: reason.trim(),
        refund_method: refundMethod,
        notes: notes.trim() || undefined,
        idempotency_key: idempotencyKey,
        items: activeItemsToReturn.map((it) => ({
          sale_item_id: it.sale_item_id,
          quantity: it.return_qty,
          restock: it.restock,
          disposition: it.disposition,
        })),
      }

      await returnsService.createSalesReturn(payload)
      toast.success('Sales return processed successfully')
      navigate('/app/sale-return')
    } catch (err) {
      toast.error(err.response?.data?.error?.message || 'Failed to process return')
    } finally {
      setIsSubmitting(false)
      setShowConfirmModal(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Sale Return</h1>
            <p className="text-sm text-gray-500 mt-1">
              Select an original sale transaction, configure returned quantities, and issue a credit refund.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate('/app/sale-return')}>
            Cancel & Return to List
          </Button>
        </div>

        {/* Step 1: Search & Select Sale */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
          <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
            Step 1: Select Original Sale Transaction <span className="text-danger-500">*</span>
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              type="search"
              placeholder="Filter sales by transaction #, customer name..."
              value={saleSearch}
              onChange={(e) => setSaleSearch(e.target.value)}
            />
            <select
              value={selectedSaleId}
              onChange={(e) => setSelectedSaleId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">Choose a sale to return items from…</option>
              {salesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.transaction_id} — {s.customer?.name || 'Walk-in'} ({fmt(s.total_amount)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {loadingEligibility && (
          <div className="p-8 text-center bg-white rounded-xl border border-gray-200 text-sm text-gray-500">
            Loading sale eligibility details...
          </div>
        )}

        {eligibility && !loadingEligibility && (
          <>
            {/* Sale Summary Banner */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
                Original Sale Overview
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-gray-50 p-3 rounded-lg border text-xs">
                <div>
                  <span className="text-gray-500 block">Invoice Number:</span>
                  <p className="font-mono font-bold text-gray-900">{eligibility.sale?.transaction_id}</p>
                </div>
                <div>
                  <span className="text-gray-500 block">Customer:</span>
                  <p className="font-semibold text-gray-900">{eligibility.sale?.customer?.name || 'Walk-in'}</p>
                </div>
                <div>
                  <span className="text-gray-500 block">Warehouse:</span>
                  <p className="font-semibold text-gray-900">{eligibility.sale?.warehouse?.name || 'Main Warehouse'}</p>
                </div>
                <div>
                  <span className="text-gray-500 block">Sale Total:</span>
                  <p className="font-bold text-gray-900">{fmt(eligibility.sale?.total_amount)}</p>
                </div>
              </div>
            </div>

            {/* Step 2: Line Items Eligibility Table */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                  Step 2: Select Items and Quantities to Return
                </label>
                <span className="text-xs text-gray-400">
                  Maximum allowed is remaining eligible quantity
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">Product</th>
                      <th className="px-2 py-2.5 text-center font-medium text-gray-600">Sold</th>
                      <th className="px-2 py-2.5 text-center font-medium text-gray-600">Prev. Ret.</th>
                      <th className="px-2 py-2.5 text-center font-medium text-gray-600">Eligible</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600 w-28">Return Qty</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Restock Disposition</th>
                      <th className="px-3 py-2.5 text-right font-medium text-gray-600">Refund Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {returnItems.map((it) => {
                      const lineRefund = it.return_qty * it.net_unit_price
                      return (
                        <tr key={it.sale_item_id} className={it.return_qty > 0 ? 'bg-primary-50/30' : ''}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">{it.product_name}</p>
                            <p className="text-3xs font-mono text-gray-400">{it.sku}</p>
                          </td>
                          <td className="px-2 py-2.5 text-center font-mono">{it.sold_quantity}</td>
                          <td className="px-2 py-2.5 text-center font-mono text-gray-500">{it.already_returned}</td>
                          <td className="px-2 py-2.5 text-center font-mono font-bold text-gray-800">
                            {it.remaining_eligible}
                          </td>
                          <td className="px-3 py-2.5">
                            <input
                              type="number"
                              min="0"
                              max={it.remaining_eligible}
                              step="any"
                              value={it.return_qty || ''}
                              onChange={(e) => handleReturnQtyChange(it.sale_item_id, e.target.value)}
                              disabled={it.remaining_eligible <= 0}
                              placeholder="0"
                              className="w-full px-2 py-1 text-center font-mono font-bold border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <label className="inline-flex items-center gap-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={it.restock}
                                onChange={(e) => handleRestockToggle(it.sale_item_id, e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-2xs text-gray-700 font-medium">
                                {it.restock ? 'Restock to Inventory' : 'Damaged (No Restock)'}
                              </span>
                            </label>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-gray-900">
                            {fmt(lineRefund)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 3: Reason & Resolution */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Step 3: Return Reason and Refund Method
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Return Reason <span className="text-danger-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="e.g. Defective item, customer changed mind, wrong specification"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Refund Method *</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="CASH">Cash Refund</option>
                    <option value="MOBILE_MONEY">Mobile Money</option>
                    <option value="CARD">Credit/Debit Card</option>
                    <option value="CREDIT">Store Credit / Account Credit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Internal Notes (Optional)</label>
                <textarea
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={2}
                  placeholder="Optional internal remarks about this return..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Step 4: Summary Banner & Submit */}
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Refund Summary</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">
                  Items to return: <span className="font-bold text-gray-900">{totalItemsCount}</span>
                </p>
                <p className="text-xl font-bold font-mono text-danger-700 mt-1">
                  Total Refund: {fmt(calculatedRefundTotal)}
                </p>
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => navigate('/app/sale-return')}>
                  Cancel
                </Button>
                <Button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={activeItemsToReturn.length === 0 || !reason.trim()}
                  className="bg-danger-600 hover:bg-danger-700 text-white"
                >
                  Confirm & Process Return
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Return Processing"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to process this sales return of{' '}
            <strong>{totalItemsCount} items</strong> with a refund amount of{' '}
            <strong className="text-danger-700">{fmt(calculatedRefundTotal)}</strong> via{' '}
            <strong>{refundMethod}</strong>?
          </p>

          <p className="text-xs text-gray-500 bg-gray-50 p-2.5 rounded border">
            Restocked items will atomically increment warehouse inventory. A unique credit note reference will be generated.
          </p>

          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
            <Button variant="ghost" onClick={() => setShowConfirmModal(false)} disabled={isSubmitting}>
              Back
            </Button>
            <Button
              variant="danger"
              onClick={handleProcessReturn}
              loading={isSubmitting}
            >
              Process Return
            </Button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  )
}
