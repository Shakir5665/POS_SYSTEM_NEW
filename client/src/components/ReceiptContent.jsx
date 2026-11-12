import { formatAmount } from '../utils/formatCurrency'
import { getReceiptDataModel } from '../utils/receiptModel'

/**
 * Pure presentation component for receipt rendering.
 * Shared 1:1 between on-screen modal review and thermal print portal.
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
    <div
      className={`receipt-body font-mono text-gray-900 ${
        isPrint
          ? 'text-xs p-1 max-w-[80mm] mx-auto w-full'
          : 'text-sm'
      }`}
      data-testid="receipt-content"
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
        <table className="w-full text-xs border-collapse table-fixed" data-testid="receipt-items">
          <thead>
            <tr className="border-b border-gray-900 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-800">
              <th className="text-left py-1 font-bold w-[28%]">Items ({summary.distinctItems})</th>
              <th className="text-right py-1 px-1.5 font-bold w-[21%]">
                <div className="text-[10px] font-normal lowercase tracking-normal text-gray-600 print:text-black">(සා.මිල)</div>
              </th>
              <th className="text-right py-1 px-1.5 font-bold w-[23%]">
                <div className="text-[10px] font-normal lowercase tracking-normal text-gray-600 print:text-black">(අපේ මිල)</div>
              </th>
              <th className="text-right py-1 pl-1.5 font-bold w-[28%]">Amount</th>
            </tr>
          </thead>
          <tbody>
            {computedItems.map((item, idx) => (
              <tr key={idx} className="receipt-table-row border-b border-dotted border-gray-200 last:border-0 align-top">
                <td className="text-left py-1 pr-1 font-medium text-gray-900 break-words">
                  <div>{item.name}</div>
                  <div className="text-[11px] text-gray-600 print:text-black font-normal">{item.qty}{item.unitLabel}</div>
                </td>
                <td className="text-right py-1 px-1.5 whitespace-nowrap text-gray-500">{fmt(item.marketPrice)}</td>
                <td className="text-right py-1 px-1.5 whitespace-nowrap text-gray-900 font-medium">{fmt(item.ourPrice)}</td>
                <td className="text-right py-1 pl-1.5 whitespace-nowrap font-bold text-gray-900">{fmt(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Financial Summary ── */}
      <div className="border-t border-dashed border-gray-400 pt-2 text-xs space-y-1.5">
        {/* 4. Grand Total */}
        <div className="flex justify-between font-bold text-base border-t border-gray-900 pt-1.5 mt-1 mb-3">
          <span>මුළු එකතුව:</span>
          <span>{fmt(summary.grandTotal)}</span>
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
