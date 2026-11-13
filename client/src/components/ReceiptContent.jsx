import { formatAmount } from '../utils/formatCurrency'
import { getReceiptDataModel } from '../utils/receiptModel'

/**
 * Pure presentation component for receipt rendering.
 * Shared 1:1 between on-screen modal review and thermal print portal.
 * Currency symbol/code is omitted in receipts per retail receipt formatting.
 */
export function ReceiptContent({ sale, settings = {}, isPrint = false, paperWidth = '80mm' }) {
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
  const is58mm = paperWidth === '58mm' || settings?.receipt_printer_paper_width === '58mm'

  return (
    <div
      className={`receipt-body font-mono text-gray-900 ${
        isPrint
          ? is58mm
            ? 'text-[11px] p-1 max-w-[58mm] mx-auto w-full'
            : 'text-xs p-1 max-w-[80mm] mx-auto w-full'
          : 'text-sm'
      }`}
      data-testid="receipt-content"
      data-paper-width={paperWidth}
    >
      {/* Store Header */}
      <div className="text-center mb-3">
        <p className="font-bold text-base">{settings.store_name || 'NexTill Store'}</p>
        {settings.store_address && <p className="text-xs text-gray-600">{settings.store_address}</p>}
        {settings.store_phone && <p className="text-xs text-gray-600">Tel: {settings.store_phone}</p>}
      </div>

      {/* Transaction Metadata */}
      <div className="border-t border-dashed border-gray-400 py-1.5 text-xs space-y-1">
        <div className="flex justify-between items-baseline gap-2">
          <div className="truncate">
            <span className="font-semibold">{transaction_id}</span>
          </div>
          <div className="text-right flex-shrink-0 text-[11px] text-gray-700">
            <span>{created_at ? new Date(created_at).toLocaleString('en-GH') : '—'}</span>
          </div>
        </div>
        <div className="flex justify-between items-baseline gap-2">
          <div className="truncate">
            <span className="text-gray-600">CASH: </span>
            <span className="font-medium">{user?.full_name || '—'}</span>
          </div>
          <div className="text-right truncate text-gray-700">
            <span className="text-gray-600">CUS: </span>
            <span className="font-medium">{customer?.name || 'Walk-in'}</span>
          </div>
        </div>
      </div>

      {/* ── Item Table ── */}
      <div className="border-t border-dashed border-gray-400 py-2 text-xs">
        {is58mm ? (
          /* 58mm Compact Layout: Product name on top line, 4 numeric columns underneath */
          <div className="space-y-2" data-testid="receipt-items-58mm">
            <div className="flex justify-between font-bold uppercase text-[10px] text-gray-700 border-b border-gray-300 pb-1">
              <span>Items ({summary.distinctItems})</span>
              <span>Qty &bull; MRKT &bull; Our &bull; Amt</span>
            </div>
            {computedItems.map((item, idx) => (
              <div key={idx} className="receipt-table-row border-b border-dotted border-gray-200 pb-1 last:border-0">
                <div className="font-semibold text-gray-900 break-words">{item.name}</div>
                <div className="flex justify-between text-[11px] text-gray-700 mt-0.5">
                  <span className="font-medium">{item.qty}{item.unitLabel}</span>
                  <span className="text-gray-500">{fmt(item.marketPrice)}</span>
                  <span className="text-gray-800 font-medium">{fmt(item.ourPrice)}</span>
                  <span className="font-bold text-gray-900 text-right">{fmt(item.lineTotal)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* 80mm Standard Layout: Full 5-Column Grid Table */
          <table className="w-full text-xs border-collapse" data-testid="receipt-items-80mm">
            <thead>
              <tr className="border-b border-gray-900 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-800">
                <th className="text-left py-1 font-bold">Items ({summary.distinctItems})</th>
                <th className="text-right py-1 pl-1 font-bold">Qty</th>
                <th className="text-right py-1 pl-1 font-bold whitespace-nowrap">MRKT_Price</th>
                <th className="text-right py-1 pl-1 font-bold whitespace-nowrap">Our_price</th>
                <th className="text-right py-1 pl-1 font-bold whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            <tbody>
              {computedItems.map((item, idx) => (
                <tr key={idx} className="receipt-table-row border-b border-dotted border-gray-200 last:border-0 align-top">
                  <td className="text-left py-1 pr-1 font-medium text-gray-900 break-words">{item.name}</td>
                  <td className="text-right py-1 pl-1 whitespace-nowrap text-gray-700">{item.qty}{item.unitLabel}</td>
                  <td className="text-right py-1 pl-1 whitespace-nowrap text-gray-500">{fmt(item.marketPrice)}</td>
                  <td className="text-right py-1 pl-1 whitespace-nowrap text-gray-900 font-medium">{fmt(item.ourPrice)}</td>
                  <td className="text-right py-1 pl-1 whitespace-nowrap font-bold text-gray-900">{fmt(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Financial Summary (Task 2.3) ── */}
      <div className="border-t border-dashed border-gray-400 pt-2 text-xs space-y-1">
        {/* Distinct Items Summary Line */}
        <div className="flex justify-between text-gray-600">
          <span>Distinct Items:</span>
          <span>{summary.distinctItems} ({summary.totalQuantity} units)</span>
        </div>

        {/* 1. Market Price Subtotal */}
        <div className="flex justify-between">
          <span className="text-gray-700">MRKT_Price Subtotal:</span>
          <span className="font-semibold">{fmt(summary.marketSubtotal)}</span>
        </div>

        {/* 2. Total Discount Provided by Us (Separate Box) */}
        {summary.ourTotalDiscount > 0 && (
          <div
            className="border border-dashed border-gray-900 p-1.5 my-1.5 rounded-sm bg-gray-50/60 print:bg-transparent"
            data-testid="discount-box"
          >
            <div className="flex justify-between items-center font-bold text-xs text-gray-900">
              <span>Total Discount (වට්ටම):</span>
              <span className="font-bold text-success-700 print:text-black">
                {fmt(summary.ourTotalDiscount)}
              </span>
            </div>
          </div>
        )}

        {/* 3. Applicable Taxes (if any) */}
        {summary.applicableTaxes > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Applicable Taxes:</span>
            <span>{fmt(summary.applicableTaxes)}</span>
          </div>
        )}


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
            {summary.outstandingBalance > 0 ? (
              <div className="flex justify-between font-bold text-danger-600 print:text-black">
                <span>Outstanding Balance:</span>
                <span>{fmt(summary.outstandingBalance)}</span>
              </div>
            ) : (
              <div className="flex justify-between font-semibold text-success-700 print:text-black">
                <span>Status:</span>
                <span>FULLY PAID</span>
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
