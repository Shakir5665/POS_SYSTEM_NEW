'use strict';

const request = require('supertest');
const app = require('../app');
const prisma = require('../utils/prismaClient');
const { validateWorkbookData } = require('../services/migration/universalExcelValidator');
const { createImportJob, confirmAndExecuteJob, getJobStatus } = require('../services/migration/universalExcelImportEngine');
const { detectTable } = require('../services/migration/tableDetector');

describe('Universal Excel Customer Import — Robustness & Resiliency', () => {
  let adminToken;

  beforeAll(async () => {
    // Acquire admin token
    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: adminUser ? adminUser.username : 'admin', password: 'password123' });
    adminToken = loginRes.body.data?.accessToken;

    // Clean up any existing test customers
    await prisma.customer.deleteMany({
      where: {
        OR: [
          { name: { startsWith: 'TEST-CUST-' } },
          { email: { startsWith: 'test_cust_' } },
          { phone: { in: ['+94770000001', '+94770000002', '+94770000003', '+94770000004'] } },
        ],
      },
    });
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: {
        OR: [
          { name: { startsWith: 'TEST-CUST-' } },
          { email: { startsWith: 'test_cust_' } },
          { phone: { in: ['+94770000001', '+94770000002', '+94770000003', '+94770000004'] } },
        ],
      },
    });
    await prisma.$disconnect();
  });

  it('detects Customer table when headers have capitalized names or common aliases', () => {
    const detected = detectTable({
      headers: ['Customer Name', 'Phone Number', 'Email Address', 'Address'],
      sheetName: 'Sheet1',
      filename: 'Customers.xlsx',
      rowCount: 8,
    });

    expect(detected.detectedTable).toBe('Customer');
    expect(detected.confidence).toBe('HIGH');
  });

  it('allows duplicate phone numbers across customers without validation errors', async () => {
    const rawRows = [
      { name: 'TEST-CUST-1', phone: '0768666525', email: 'test_cust_1@example.com' },
      { name: 'TEST-CUST-2', phone: null, email: null },
      { name: 'TEST-CUST-3', phone: '0768666525', email: 'test_cust_3@example.com' }, // Same phone as Row 1
      { name: 'TEST-CUST-4', phone: '0768666525', email: 'test_cust_4@example.com' }, // Same phone as Row 1
      { name: 'TEST-CUST-5', phone: '0768666525', email: 'test_cust_5@example.com' }, // Same phone as Row 1
    ];

    const report = await validateWorkbookData({
      tableName: 'Customer',
      headers: ['name', 'phone', 'email'],
      rawRows,
      mode: 'INSERT',
    });

    // Phone should NOT be treated as a unique collision
    const phoneIssues = report.rowIssues.filter((i) => i.column === 'phone');
    expect(phoneIssues.length).toBe(0);
    expect(report.isValidPlan).toBe(true);
  });

  it('validates in-file duplicate unique columns (e.g. email) before execution', async () => {
    const rawRows = [
      { name: 'TEST-CUST-1', phone: '0768666525', email: 'duplicate_email@example.com' },
      { name: 'TEST-CUST-2', phone: '0768666525', email: null },
      { name: 'TEST-CUST-3', phone: '0768666525', email: 'duplicate_email@example.com' }, // Duplicate email!
    ];

    const report = await validateWorkbookData({
      tableName: 'Customer',
      headers: ['name', 'phone', 'email'],
      rawRows,
      mode: 'INSERT',
    });

    const emailIssues = report.rowIssues.filter((i) => i.column === 'email');
    expect(emailIssues.length).toBeGreaterThanOrEqual(1);
    expect(emailIssues[0].code).toBe('DUPLICATE_UNIQUE_VALUE_IN_FILE');
    expect(emailIssues[0].row).toBe(3);
  });

  it('executes customer batch with identical phone numbers successfully into database', async () => {
    // 6 customers all sharing the exact same phone number '0768666525'
    const rawRows = [
      { name: 'TEST-CUST-A', phone: '0768666525', email: 'test_cust_a@example.com' },
      { name: 'TEST-CUST-B', phone: '0768666525', email: 'test_cust_b@example.com' },
      { name: 'TEST-CUST-C', phone: '0768666525', email: null },
      { name: 'TEST-CUST-D', phone: '0768666525', email: 'test_cust_d@example.com' },
      { name: 'TEST-CUST-E', phone: '0768666525', email: 'test_cust_e@example.com' },
      { name: 'TEST-CUST-F', phone: '0768666525', email: 'test_cust_f@example.com' },
    ];

    const jobResult = await createImportJob({
      tableName: 'Customer',
      headers: ['name', 'phone', 'email'],
      rawRows,
      mode: 'INSERT',
      filename: 'Customers_Shared_Phone.xlsx',
      username: 'ADMIN',
    });

    await confirmAndExecuteJob(jobResult.jobId);

    let status;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 200));
      status = getJobStatus(jobResult.jobId);
      if (status && (status.status === 'COMPLETED' || status.status === 'FAILED')) {
        break;
      }
    }

    expect(status.status).toBe('COMPLETED');
    expect(status.progress.inserted).toBe(6);
    expect(status.progress.failed).toBe(0);

    const insertedInDb = await prisma.customer.findMany({
      where: { name: { startsWith: 'TEST-CUST-' } },
    });

    expect(insertedInDb.length).toBe(6);
    for (const c of insertedInDb) {
      expect(c.phone).toBe('0768666525');
    }
  });
});
