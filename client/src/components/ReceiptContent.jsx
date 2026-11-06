import { formatAmount } from '../utils/formatCurrency'

/**
 * Pure presentation component for receipt rendering.
 * Shared 1:1 between on-screen modal review and 80mm thermal print portal.
 * Currency symbol/code is omitted in receipts per retail receipt formatting.
 */
export function ReceiptContent({ sale, settings = {}, isPrint = false }) {
  if (!sale) return null

  const fmt = (v) => formatAmount(v)

  const {
    transaction_id,
    created_at,
    user,
    customer,
    items = [],
    subtotal,
    discount_amount,
    tax_amount,
    total_amount,
    payment_method,
    payment,
  } = sale

  const itemsList = items.length > 0 ? items : (sale.sale_items || [])
  const paymentObj = payment || (sale.payments?.[0] ?? null)

  return (
    <div className={`receipt-body font-mono text-gray-900 ${isPrint ? 'text-xs p-1' : 'text-sm'}`}>
      {/* Store Header */}
      <div className="text-center mb-3">
        <p className="font-bold text-base">{settings.store_name || 'NexTill Store'}</p>
        {settings.store_address && <p className="text-xs text-gray-600">{settings.store_address}</p>}
        {settings.store_phone && <p className="text-xs text-gray-600">Tel: {settings.store_phone}</p>}
      </div>

      {/* Transaction Metadata */}
      <div className="border-t border-dashed border-gray-400 py-2 text-xs space-y-0.5">
        <div className="flex justify-between">
          <span className="text-gray-600">TXN:</span>
          <span className="font-semibold">{transaction_id}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Date:</span>
          <span>{created_at ? new Date(created_at).toLocaleString('en-GH') : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Cashier:</span>
          <span>{user?.full_name || '—'}</span>
        </div>
        {customer && (
          <div className="flex justify-between">
            <span className="text-gray-600">Customer:</span>
            <span>{customer.name}</span>
          </div>
        )}
      </div>

      {/* Items Table */}
      <div className="border-t border-dashed border-gray-400 py-2 text-xs">
        <div className="flex justify-between font-bold mb-1 border-b border-gray-200 pb-1">
          <span className="w-[38%] text-left pr-1">Item</span>
          <span className="w-[18%] text-right px-1">Qty</span>
          <span className="w-[22%] text-right px-1">Price</span>
          <span className="w-[22%] text-right pl-1">Total</span>
        </div>
        {itemsList.map((item, idx) => {
          const name = item.product?.name || item.name || item.product_name || 'Item'
          const qty = item.quantity != null ? String(item.quantity) : '1'
          const unitLabel = item.unit ? ` ${item.unit}` : ''
          const unitPrice = item.unit_price != null ? item.unit_price : item.price
          const lineTotal = item.total != null ? item.total : (Number(qty) * Number(unitPrice || 0))
          return (
            <div key={idx} className="receipt-table-row flex justify-between py-1 border-b border-dotted border-gray-100 last:border-0">
              <span className="w-[38%] text-left break-words pr-1">{name}</span>
              <span className="w-[18%] text-right whitespace-nowrap px-1">{qty}{unitLabel}</span>
              <span className="w-[22%] text-right whitespace-nowrap px-1">{fmt(unitPrice)}</span>
              <span className="w-[22%] text-right whitespace-nowrap pl-1 font-medium">{fmt(lineTotal)}</span>
            </div>
          )
        })}
      </div>

      {/* Financial Totals */}
      <div className="border-t border-dashed border-gray-400 pt-2 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-gray-600">Subtotal:</span>
          <span>{fmt(subtotal)}</span>
        </div>
        {parseFloat(discount_amount || 0) > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Discount:</span>
            <span>-{fmt(discount_amount)}</span>
          </div>
        )}
        {parseFloat(tax_amount || 0) > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Tax:</span>
            <span>{fmt(tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t border-gray-400 pt-1 mt-1">
          <span>TOTAL:</span>
          <span>{fmt(total_amount)}</span>
        </div>
        <div className="flex justify-between pt-1">
          <span className="text-gray-600">Payment:</span>
          <span className="font-medium">{payment_method?.replace('_', ' ') || 'CASH'}</span>
        </div>
        {paymentObj && (
          <>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount Paid:</span>
              <span>{fmt(paymentObj.amount_paid)}</span>
            </div>
            {parseFloat(paymentObj.change_given || 0) > 0 && (
              <div className="flex justify-between font-semibold">
                <span className="text-gray-600">Change:</span>
                <span>{fmt(paymentObj.change_given)}</span>
              </div>
            )}
            {paymentObj.reference && (
              <div className="flex justify-between text-[10px] text-gray-500">
                <span>Ref:</span>
                <span className="font-mono">{paymentObj.reference}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Receipt Footer */}
      <div className="border-t border-dashed border-gray-400 mt-3 pt-2 text-center text-xs text-gray-500">
        <p>{settings.receipt_footer || 'Thank you for your business!'}</p>
      </div>
    </div>
  )
}
