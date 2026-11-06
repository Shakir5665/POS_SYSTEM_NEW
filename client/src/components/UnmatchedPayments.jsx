import { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Button } from './Button'
import { Badge } from './Badge'
import { Modal } from './Modal'
import { paymentsService } from '../services/payments'
import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'
import { fromPesewas } from '../utils/money'

const CHANNEL_LABELS = { card: 'Card', mobile_money: 'Mobile money', bank: 'Bank', ussd: 'USSD' }

/**
 * Paystack charges that succeeded but never became a sale, e.g. because the
 * browser closed after the customer paid. Renders nothing when there are none.
 */
export function UnmatchedPayments() {
  const settings = useSettings()
  const fmt = (pesewas) => formatCurrency(fromPesewas(pesewas), settings.currency_symbol || 'GH₵')

  const [payments, setPayments] = useState([])
  const [refundTarget, setRefundTarget] = useState(null)
  const [refunding, setRefunding] = useState(false)

  const fetchPayments = useCallback(async () => {
    try {
      const res = await paymentsService.unmatched()
      setPayments(res.data?.data ?? [])
    } catch {
      toast.error('Failed to load unmatched Paystack payments')
    }
  }, [])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  async function confirmRefund() {
    setRefunding(true)
    try {
      await paymentsService.refundUnmatched(refundTarget.id)
      toast.success('Refund requested. It will complete when Paystack confirms it.')
      setRefundTarget(null)
      fetchPayments()
    } catch (err) {
      toast.error(err?.response?.data?.error?.message ?? 'Refund failed')
    } finally {
      setRefunding(false)
    }
  }

  if (payments.length === 0) return null

  return (
    <section className="bg-warning-50 border border-warning-100 rounded-xl p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-warning-600">Paystack payments without a sale ({payments.length})</h2>
        <p className="text-xs text-gray-600 mt-0.5">
          These customers paid, but no sale was recorded (for example, the browser closed after payment). Ring the sale up again
          and take payment another way, or refund the payment.
        </p>
      </div>

      <ul className="divide-y divide-warning-100">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <div className="space-y-0.5">
              <p className="font-mono text-xs font-medium text-gray-900">{p.reference}</p>
              <p className="text-xs text-gray-500">
                {[CHANNEL_LABELS[p.channel] ?? p.channel, p.customer_email, p.paid_at && new Date(p.paid_at).toLocaleString('en-GH')]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">{fmt(p.amount)}</span>
              {p.refund_requested_at ? (
                <Badge variant="warning">Refund pending</Badge>
              ) : (
                <Button size="sm" variant="danger" onClick={() => setRefundTarget(p)}>
                  Refund
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Modal isOpen={!!refundTarget} onClose={() => setRefundTarget(null)} title="Refund Paystack payment" size="sm">
        {refundTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Refund <span className="font-semibold">{fmt(refundTarget.amount)}</span> paid with{' '}
              <span className="font-mono">{refundTarget.reference}</span>?
            </p>
            <p className="text-sm text-gray-500">
              Paystack returns the money to the customer. The payment stays listed as &quot;Refund pending&quot; until Paystack confirms it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRefundTarget(null)} disabled={refunding}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmRefund} isLoading={refunding}>
                Refund {fmt(refundTarget.amount)}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  )
}
