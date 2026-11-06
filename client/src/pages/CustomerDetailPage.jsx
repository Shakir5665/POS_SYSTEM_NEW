import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { DashboardLayout } from '../layouts/DashboardLayout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Table } from '../components/Table'
import { Pagination } from '../components/Pagination'
import { customersService } from '../services/customers'
import { formatCurrency } from '../utils/formatCurrency'

const PAYMENT_BADGE = {
  CASH: 'default',
  MOBILE_MONEY: 'primary',
  CARD: 'success',
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 py-3 border-b border-gray-100 last:border-0">
      <dt className="text-sm font-medium text-gray-500 sm:w-36 flex-shrink-0">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? <span className="text-gray-400">—</span>}</dd>
    </div>
  )
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [customer, setCustomer] = useState(null)
  const [purchases, setPurchases] = useState([])
  const [meta, setMeta] = useState({ page: 1, total_pages: 1 })
  const [page, setPage] = useState(1)
  const [loadingCustomer, setLoadingCustomer] = useState(true)
  const [loadingPurchases, setLoadingPurchases] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchCustomer() {
      setLoadingCustomer(true)
      try {
        const res = await customersService.get(id)
        setCustomer(res.data?.data ?? res.data)
      } catch {
        setError('Customer not found or could not be loaded.')
      } finally {
        setLoadingCustomer(false)
      }
    }
    fetchCustomer()
  }, [id])

  const fetchPurchases = useCallback(async () => {
    setLoadingPurchases(true)
    try {
      const res = await customersService.purchases(id, { page, per_page: 20 })
      setPurchases(res.data?.data ?? res.data ?? [])
      setMeta(res.data?.meta ?? { page: 1, total_pages: 1 })
    } catch {
      toast.error('Failed to load purchase history')
    } finally {
      setLoadingPurchases(false)
    }
  }, [id, page])

  useEffect(() => {
    fetchPurchases()
  }, [fetchPurchases])

  const purchaseColumns = [
    {
      key: 'transaction_id',
      label: 'Transaction ID',
      render: (v) => <span className="font-mono text-xs text-primary-700 font-medium">{v}</span>,
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (v) =>
        v
          ? new Date(v).toLocaleDateString('en-GH', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
    },
    {
      key: 'items_count',
      label: 'Items',
      render: (v) => v ?? '—',
    },
    {
      key: 'total_amount',
      label: 'Total',
      render: (v) => <span className="font-semibold">{formatCurrency(v ?? 0)}</span>,
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (v) => v ? <Badge variant={PAYMENT_BADGE[v] ?? 'default'}>{v.replace('_', ' ')}</Badge> : '—',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/customers')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Customers
          </Button>
        </div>

        {error && (
          <div className="bg-danger-50 border border-danger-200 text-danger-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Customer info card */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          {loadingCustomer ? (
            <div className="animate-pulse space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 bg-gray-200 rounded w-1/3" />
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                </div>
              </div>
              <div className="h-4 bg-gray-200 rounded w-2/3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ) : customer ? (
            <div className="flex flex-col sm:flex-row sm:items-start gap-6">
              {/* Avatar */}
              <div className="w-16 h-16 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-2xl font-bold flex-shrink-0">
                {customer.name?.[0]?.toUpperCase() ?? '?'}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
                    <p className="text-sm text-gray-500 mt-0.5">{customer.email ?? 'No email'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-warning-500" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-lg font-bold text-gray-800">{customer.loyalty_points ?? 0}</span>
                    <span className="text-sm text-gray-500">loyalty points</span>
                  </div>
                </div>

                <dl className="mt-4">
                  <InfoRow label="Phone" value={customer.phone} />
                  <InfoRow label="Email" value={customer.email} />
                  <InfoRow label="Address" value={customer.address} />
                  <InfoRow
                    label="Member Since"
                    value={
                      customer.created_at
                        ? new Date(customer.created_at).toLocaleDateString('en-GH', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : null
                    }
                  />
                </dl>
              </div>
            </div>
          ) : null}
        </div>

        {/* Purchase history */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Purchase History</h2>
          </div>
          <Table
            columns={purchaseColumns}
            data={purchases}
            isLoading={loadingPurchases}
            emptyMessage="No purchases found for this customer."
          />
          {meta.total_pages > 1 && (
            <div className="flex justify-end px-6 py-4 border-t border-gray-100">
              <Pagination page={meta.page ?? page} total_pages={meta.total_pages} onPageChange={setPage} />
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
