import { useSettings } from '../hooks/useSettings'
import { formatCurrency } from '../utils/formatCurrency'
import { Button } from './Button'

// ─── Receipt Component (rendered inside a modal, printable) ───────────────────
export function Receipt({ sale, onClose }) {
  const settings = useSettings()
  const sym = settings.currency_symbol || 'GH₵'
  const fmt = (v) => formatCurrency(v, sym)

  function handlePrint() {
    window.print()
  }

  if (!sale) return null

  const { transaction_id, created_at, user, customer, items, subtotal, discount_amount, tax_amount, total_amount, payment_method, payment } = sale

  return (
    <>
      {/* Print styles injected inline so they scope to .receipt-root */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          .receipt-print-wrapper { display: block !important; position: fixed; inset: 0; z-index: 9999; background: white; }
          .receipt-root { width: 80mm; margin: 0 auto; font-family: monospace; font-size: 12px; }
          .receipt-no-print { display: none !important; }
        }
        .receipt-print-wrapper { display: none; }
      `}</style>

      {/* Screen receipt inside modal */}
      <div className="receipt-root font-mono text-sm text-gray-900">
        <div className="text-center mb-3">
          <p className="font-bold text-base">{settings.store_name || 'GhanaShop POS'}</p>
          {settings.store_address && <p className="text-xs text-gray-500">{settings.store_address}</p>}
          {settings.store_phone && <p className="text-xs text-gray-500">Tel: {settings.store_phone}</p>}
        </div>

        <div className="border-t border-dashed border-gray-400 pt-2 mb-2 text-xs">
          <div className="flex justify-between"><span>TXN:</span><span className="font-semibold">{transaction_id}</span></div>
          <div className="flex justify-between"><span>Date:</span><span>{new Date(created_at).toLocaleString('en-GH')}</span></div>
          <div className="flex justify-between"><span>Cashier:</span><span>{user?.full_name || '—'}</span></div>
          {customer && <div className="flex justify-between"><span>Customer:</span><span>{customer.name}</span></div>}
        </div>

        <div className="border-t border-dashed border-gray-400 py-2 text-xs">
          <div className="flex justify-between font-semibold mb-1">
            <span className="w-2/5">Item</span>
            <span className="w-1/5 text-right">Qty</span>
            <span className="w-1/5 text-right">Price</span>
            <span className="w-1/5 text-right">Total</span>
          </div>
          {(items || []).map((item, i) => (
            <div key={i} className="flex justify-between py-0.5">
              <span className="w-2/5 truncate">{item.product?.name || item.name}</span>
              <span className="w-1/5 text-right">{item.quantity}</span>
              <span className="w-1/5 text-right">{fmt(item.unit_price)}</span>
              <span className="w-1/5 text-right">{fmt(item.total)}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-dashed border-gray-400 pt-2 text-xs space-y-1">
          <div className="flex justify-between"><span>Subtotal:</span><span>{fmt(subtotal)}</span></div>
          {parseFloat(discount_amount) > 0 && (
            <div className="flex justify-between text-danger-600"><span>Discount:</span><span>-{fmt(discount_amount)}</span></div>
          )}
          {parseFloat(tax_amount) > 0 && (
            <div className="flex justify-between"><span>Tax:</span><span>{fmt(tax_amount)}</span></div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-gray-300 pt-1 mt-1">
            <span>TOTAL:</span><span>{fmt(total_amount)}</span>
          </div>
          <div className="flex justify-between"><span>Payment:</span><span>{payment_method}</span></div>
          {payment && (
            <>
              <div className="flex justify-between"><span>Amount Paid:</span><span>{fmt(payment.amount_paid)}</span></div>
              {parseFloat(payment.change_given) > 0 && (
                <div className="flex justify-between font-semibold"><span>Change:</span><span>{fmt(payment.change_given)}</span></div>
              )}
              {payment.reference && (
                <div className="flex justify-between"><span>Reference:</span><span>{payment.reference}</span></div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-dashed border-gray-400 mt-3 pt-2 text-center text-xs text-gray-500">
          <p>{settings.receipt_footer || 'Thank you for shopping with us!'}</p>
        </div>
      </div>

      {/* Hidden printable duplicate (positioned off-screen during normal view) */}
      <div className="receipt-print-wrapper">
        <div className="receipt-root font-mono text-sm text-gray-900 p-4">
          <div className="text-center mb-3">
            <p className="font-bold text-base">{settings.store_name || 'GhanaShop POS'}</p>
            {settings.store_address && <p className="text-xs">{settings.store_address}</p>}
            {settings.store_phone && <p className="text-xs">Tel: {settings.store_phone}</p>}
          </div>
          <div className="border-t border-dashed pt-2 mb-2 text-xs">
            <div className="flex justify-between"><span>TXN:</span><span>{transaction_id}</span></div>
            <div className="flex justify-between"><span>Date:</span><span>{new Date(created_at).toLocaleString('en-GH')}</span></div>
            <div className="flex justify-between"><span>Cashier:</span><span>{user?.full_name || '—'}</span></div>
            {customer && <div className="flex justify-between"><span>Customer:</span><span>{customer.name}</span></div>}
          </div>
          <div className="border-t border-dashed py-2 text-xs">
            <div className="flex justify-between font-bold mb-1">
              <span className="w-2/5">Item</span>
              <span className="w-1/5 text-right">Qty</span>
              <span className="w-1/5 text-right">Price</span>
              <span className="w-1/5 text-right">Total</span>
            </div>
            {(items || []).map((item, i) => (
              <div key={i} className="flex justify-between">
                <span className="w-2/5 truncate">{item.product?.name || item.name}</span>
                <span className="w-1/5 text-right">{item.quantity}</span>
                <span className="w-1/5 text-right">{fmt(item.unit_price)}</span>
                <span className="w-1/5 text-right">{fmt(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed pt-2 text-xs space-y-0.5">
            <div className="flex justify-between"><span>Subtotal:</span><span>{fmt(subtotal)}</span></div>
            {parseFloat(discount_amount) > 0 && <div className="flex justify-between"><span>Discount:</span><span>-{fmt(discount_amount)}</span></div>}
            {parseFloat(tax_amount) > 0 && <div className="flex justify-between"><span>Tax:</span><span>{fmt(tax_amount)}</span></div>}
            <div className="flex justify-between font-bold border-t pt-1"><span>TOTAL:</span><span>{fmt(total_amount)}</span></div>
            <div className="flex justify-between"><span>Payment:</span><span>{payment_method}</span></div>
            {payment?.amount_paid && <div className="flex justify-between"><span>Paid:</span><span>{fmt(payment.amount_paid)}</span></div>}
            {payment?.change_given > 0 && <div className="flex justify-between"><span>Change:</span><span>{fmt(payment.change_given)}</span></div>}
            {payment?.reference && <div className="flex justify-between"><span>Ref:</span><span>{payment.reference}</span></div>}
          </div>
          <div className="border-t border-dashed mt-2 pt-2 text-center text-xs">{settings.receipt_footer || 'Thank you for shopping with us!'}</div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-4 receipt-no-print">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button variant="primary" onClick={handlePrint}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Receipt
        </Button>
      </div>
    </>
  )
}
