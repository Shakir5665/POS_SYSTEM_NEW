const XLSX = require('./server/node_modules/xlsx');

console.log('Testing 200,000 rows benchmark...');
const t0 = Date.now();

// Generate 200,000 rows x 20 columns
const headers = [
  'transaction_id', 'user_id', 'customer_id', 'warehouse_id',
  'subtotal', 'discount_amount', 'tax_amount', 'total_amount',
  'amount_paid', 'balance_due', 'payment_method', 'payment_status',
  'notes', 'sale_date', 'is_legacy_import', 'loyalty_points_earned',
  'col17', 'col18', 'col19', 'col20'
];

console.log('Generating AOA...');
const rows = [headers];
for (let i = 1; i <= 200000; i++) {
  rows.push([
    `TX-${i}`, 'USR-1', 'CUST-1', 'WH-1',
    100.50, 0, 10.05, 110.55,
    110.55, 0, 'CASH', 'COMPLETED',
    'POS sale', '2026-01-01', true, 5,
    'val17', 'val18', 'val19', 'val20'
  ]);
}
console.log('AOA generated in', Date.now() - t0, 'ms. Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

const t1 = Date.now();
const ws = XLSX.utils.aoa_to_sheet(rows);
console.log('aoa_to_sheet in', Date.now() - t1, 'ms. Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');

const t2 = Date.now();
const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 });
console.log('sheet_to_json in', Date.now() - t2, 'ms. Row count:', aoa.length);
console.log('Total time:', Date.now() - t0, 'ms. Final memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB');
