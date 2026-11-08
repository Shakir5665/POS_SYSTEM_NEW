import { formatAmount } from '../utils/formatCurrency'
import { getReceiptDataModel } from '../utils/receiptModel'

/**
 * Pure presentation component for receipt rendering.
 * Shared 1:1 between on-screen modal review and thermal print portal (58mm & 80mm).
 * Currency symbol/code is omitted in receipts per retail receipt formatting.
 */
export function ReceiptContent({ sale, settings = {}, isPrint = false }) {
  if (!sale) return null

  const fmt = (v) => formatAmount(v)
  const { items: computedItems, summary } = getReceiptDataModel(sale)

  const {
    transaction_id,
    created_at,
    user,
    customer,
    payment_method,
    payment,
  } = sale

  const paymentObj = payment || (sale.payments?.[0] ?? null)

  return (
    <div className={`receipt-body font-mono text-gray-900 ${isPrint ? 'text-xs p-1 max-w-[80mm] mx-auto w-full' : 'text-sm'}`}>
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

      {/* Items Section */}
      <div className="border-t border-dashed border-gray-400 py-2 text-xs space-y-2">
        <div className="font-bold uppercase tracking-wider text-[11px] text-gray-700 border-b border-gray-200 pb-1">
          Items
        </div>
        {computedItems.map((item, idx) => (
          <div key={idx} className="receipt-table-row py-1 border-b border-dotted border-gray-200 last:border-0">
            <div className="font-semibold text-gray-900 break-words">{item.name}</div>
            <div className="flex justify-between text-gray-700 mt-0.5">
              <span>{item.qty}{item.unitLabel} × {fmt(item.unitPrice)}</span>
              <span className="font-medium whitespace-nowrap">
                {item.totalDiscount > 0 ? `= ${fmt(item.lineGross)}` : fmt(item.lineTotal)}
              </span>
            </div>
            {item.usualPrice > item.ourPrice && (
              <div className="flex justify-between text-[11px] text-gray-500 mt-0.5">
                <span>Usual: {fmt(item.usualPrice)} | Our: {fmt(item.ourPrice)}</span>
                {item.predefinedApplied && item.predefinedDiscountAmount > 0 && (
                  <span className="text-success-700 print:text-black font-medium">
                    Disc: -{fmt(item.predefinedDiscountAmount)}
                  </span>
                )}
              </div>
            )}
            {item.totalDiscount > 0 && (
              <div className="flex justify-between text-red-600 print:text-black mt-0.5">
                <span className="truncate pr-1">Discount ({fmt(item.unitDiscount)} × {item.qty}):</span>
                <span className="font-medium whitespace-nowrap">-{fmt(item.totalDiscount)}</span>
              </div>
            )}
            {item.totalDiscount > 0 && (
              <div className="flex justify-between font-bold text-gray-900 mt-0.5">
                <span>Line Total:</span>
                <span className="whitespace-nowrap">{fmt(item.lineTotal)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      <div className="border-t border-dashed border-gray-400 pt-2 text-xs space-y-1">
        {/* Distinct Items */}
        <div className="flex justify-between text-gray-600">
          <span>Distinct Items:</span>
          <span>{summary.distinctItems || computedItems.length} ({summary.totalQuantity || computedItems.reduce((s, i) => s + i.qty, 0)} units)</span>
        </div>

        {/* 1. Usual Price Subtotal / Gross Subtotal */}
        <div className="flex justify-between">
          <span className="text-gray-600">
            {summary.usualSubtotal != null ? 'Usual Price Subtotal:' : 'Gross Subtotal:'}
          </span>
          <span className="font-semibold">{fmt(summary.usualSubtotal != null ? summary.usualSubtotal : summary.grossSubtotal)}</span>
        </div>

        {/* 2. Total Predefined Discounts */}
        {summary.totalPredefinedDiscounts > 0 && (
          <div className="flex justify-between text-success-700 print:text-black">
            <span>Predefined Discounts:</span>
            <span className="font-semibold">-{fmt(summary.totalPredefinedDiscounts)}</span>
          </div>
        )}

        {/* 3. Additional Cart Discount */}
        {summary.additionalCartDiscount > 0 && (
          <div className="flex justify-between text-red-600 print:text-black">
            <span>Additional Cart Discount:</span>
            <span className="font-semibold">-{fmt(summary.additionalCartDiscount)}</span>
          </div>
        )}

        {/* 4. Total Line / Product Discounts */}
        {summary.totalProductDiscounts > 0 && (
          <div className="flex justify-between text-red-600 print:text-black">
            <span>Total Product Discounts:</span>
            <span className="font-semibold">-{fmt(summary.totalProductDiscounts)}</span>
          </div>
        )}

        {/* 5. Total Discounts */}
        {summary.totalDiscounts > 0 && (
          <div className="flex justify-between text-gray-700 font-semibold print:text-black">
            <span>Total Discounts:</span>
            <span>-{fmt(summary.totalDiscounts)}</span>
          </div>
        )}

        {/* 5. Applicable Taxes */}
        {summary.applicableTaxes > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Applicable Taxes:</span>
            <span>{fmt(summary.applicableTaxes)}</span>
          </div>
        )}

        {/* 6. Final Total */}
        <div className="flex justify-between font-bold text-base border-t border-gray-900 pt-1 mt-1">
          <span>Final Total:</span>
          <span>{fmt(summary.finalTotal)}</span>
        </div>

        {/* Payment Breakdown */}
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
            {summary.outstandingBalance > 0 && (
              <div className="flex justify-between font-bold text-danger-600 print:text-black">
                <span>Outstanding Balance:</span>
                <span>{fmt(summary.outstandingBalance)}</span>
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
