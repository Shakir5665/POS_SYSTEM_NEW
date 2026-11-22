const XLSX = require('./server/node_modules/xlsx');

// Let's test: What if a sheet has data rows (e.g. 100 rows)
// and at row 1048576 there is:
// a) cell with empty string ''
// b) cell with spaces '   '
// c) cell with 0
// d) cell with formula '=IF(A1=\"\",\"\",1)'
// e) cell with error
// f) cell with null
// g) cell with undefined

const ws = {
  '!ref': 'A1:Q1048576',
  'A1': { t: 's', v: 'id' },
  'B1': { t: 's', v: 'amount' },
  'A2': { t: 's', v: 'TX1' },
  'B2': { t: 'n', v: 100 },
};

// What if there is a cell at Q1048576 that is just an empty string?
ws['Q1048576'] = { t: 's', v: '' };

// What if there is a cell at Q1048575 that is 0?
// ws['Q1048575'] = { t: 'n', v: 0 };

console.log('Testing...');
