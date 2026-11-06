/**
 * Display status for a sale. A card or mobile money refund stays
 * COMPLETED with refund_requested_at set until Paystack's webhook
 * confirms it, so that case is shown as "Refund pending".
 * @returns {{ label: string, variant: 'success' | 'warning' | 'danger' | 'default' }}
 */
export function saleStatus(sale) {
  if (sale.payment_status === 'REFUNDED') return { label: 'Refunded', variant: 'danger' }
  if (sale.refund_requested_at) return { label: 'Refund pending', variant: 'warning' }
  if (sale.payment_status === 'COMPLETED') return { label: 'Completed', variant: 'success' }
  return { label: 'Pending', variant: 'default' }
}

/** Only completed sales without a refund in progress can be refunded. */
export function canRefund(sale) {
  return sale.payment_status === 'COMPLETED' && !sale.refund_requested_at
}

export const PAYMENT_METHOD_LABELS = {
  CASH: 'Cash',
  CARD: 'Card',
  MOBILE_MONEY: 'Mobile money',
}
