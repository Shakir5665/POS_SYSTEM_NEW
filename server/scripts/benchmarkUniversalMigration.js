'use strict';

// Strictly use the isolated disposable local PostgreSQL database
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5432/nextill_isolated_phase4b?schema=public';

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const prisma = require('../src/utils/prismaClient');
const { parseSingleTableWorkbook } = require('../src/services/migration/universalExcelParser');
const { validateWorkbookData } = require('../src/services/migration/universalExcelValidator');
const {
  createImportJob,
  confirmAndExecuteJob,
  getJobStatus,
} = require('../src/services/migration/universalExcelImportEngine');

function assertIsolatedDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (dbUrl.includes('neon.tech') || dbUrl.includes('DASHPOS') || !dbUrl.includes('127.0.0.1')) {
    console.error('FATAL: Benchmark cannot run against staging or cloud database!');
    process.exit(1);
  }
}

function generateBenchmarkDataset(rowCount, prefix = 'BENCH') {
  const headers = ['name', 'phone', 'email', 'address', 'loyalty_points'];
  const rows = [];
  for (let i = 1; i <= rowCount; i++) {
    rows.push({
      name: `${prefix} Customer ${i}`,
      phone: `079${String(i).padStart(7, '0')}`,
      email: `${prefix.toLowerCase()}_user_${i}@benchtest.com`,
      address: `${i} Benchmark Boulevard, Suite ${i % 100}`,
      loyalty_points: i % 50,
    });
  }

  // Create XLSX workbook buffer
  const aoa = [headers, ...rows.map((r) => [r.name, r.phone, r.email, r.address, r.loyalty_points])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customer');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return { buffer, headers, rows };
}

async function runBenchmarkForSize(size) {
  console.log(`\n======================================================`);
  console.log(`Starting Benchmark for Dataset Size: ${size.toLocaleString()} rows`);
  console.log(`======================================================`);

  const initialMemory = process.memoryUsage().heapUsed;
  const overallStart = Date.now();

  // 1. Generation
  const genStart = Date.now();
  const dataset = generateBenchmarkDataset(size, `B${size}`);
  const genDuration = Date.now() - genStart;
  const fileSizeKb = (dataset.buffer.length / 1024).toFixed(1);
  console.log(`- Dataset generation: ${genDuration}ms (${fileSizeKb} KB)`);

  // 2. Parsing
  const parseStart = Date.now();
  const parsed = parseSingleTableWorkbook(dataset.buffer, { filename: `Customer_${size}.xlsx` });
  const parseDuration = Date.now() - parseStart;
  console.log(
    `- Parsing duration: ${parseDuration}ms (Detected: ${parsed.detection.detectedTable}, Confidence: ${parsed.detection.confidence})`
  );

  // 3. Validation
  const valStart = Date.now();
  const validationReport = await validateWorkbookData({
    tableName: 'Customer',
    headers: parsed.headers,
    rawRows: parsed.rawRows,
    mode: 'INSERT',
  });
  const valDuration = Date.now() - valStart;
  console.log(
    `- Validation duration: ${valDuration}ms (Valid: ${validationReport.summary.validRows}, Invalid: ${validationReport.summary.invalidRows})`
  );

  // 4. Database Write Execution
  const writeStart = Date.now();
  const job = await createImportJob({
    tableName: 'Customer',
    mode: 'INSERT',
    headers: parsed.headers,
    rawRows: parsed.rawRows,
    filename: `Customer_${size}.xlsx`,
  });

  await confirmAndExecuteJob(job.jobId);

  // Poll until job completes
  let jobResult = null;
  while (true) {
    await new Promise((r) => setTimeout(r, 100));
    jobResult = getJobStatus(job.jobId);
    if (jobResult.status === 'COMPLETED' || jobResult.status === 'FAILED') {
      break;
    }
  }

  const writeDuration = Date.now() - writeStart;
  const totalDuration = Date.now() - overallStart;
  const peakMemory = Math.round((process.memoryUsage().heapUsed - initialMemory) / (1024 * 1024));
  const throughput = Math.round((size / (totalDuration / 1000)) * 10) / 10;
  const writeThroughput = Math.round((size / (writeDuration / 1000)) * 10) / 10;

  console.log(`- Database write duration: ${writeDuration}ms`);
  console.log(`- Total duration: ${totalDuration}ms`);
  console.log(`- End-to-End Throughput: ${throughput} rows/sec (Write: ${writeThroughput} rows/sec)`);
  console.log(`- Peak Heap Delta: ${peakMemory} MB`);
  console.log(`- Inserted: ${jobResult.progress.inserted}, Failed: ${jobResult.progress.failed}`);

  // Clean up benchmark records
  await prisma.customer.deleteMany({
    where: { email: { contains: `b${size.toString().toLowerCase()}_user_` } },
  });

  return {
    size,
    fileSizeKb,
    parseDuration,
    valDuration,
    writeDuration,
    totalDuration,
    throughput,
    writeThroughput,
    peakMemoryMb: Math.max(1, peakMemory),
    errorRate: ((jobResult.progress.failed / size) * 100).toFixed(2) + '%',
  };
}

async function runAllBenchmarks() {
  assertIsolatedDatabase();
  console.log('Isolated database connection verified. Running benchmarks...');

  const sizes = [100, 1000, 10000];
  const results = [];

  for (const s of sizes) {
    const res = await runBenchmarkForSize(s);
    results.push(res);
  }

  console.log('\n======================================================');
  console.log('UNIVERSAL EXCEL IMPORT PERFORMANCE BENCHMARK SUMMARY');
  console.log('======================================================');
  console.table(results);

  // Write results to docs
  const docDir = path.resolve(__dirname, '../../docs/migration');
  if (!fs.existsSync(docDir)) {
    fs.mkdirSync(docDir, { recursive: true });
  }

  fs.writeFileSync(path.join(docDir, 'benchmark-results.json'), JSON.stringify(results, null, 2));

  return results;
}

if (require.main === module) {
  runAllBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}

module.exports = { runAllBenchmarks };
