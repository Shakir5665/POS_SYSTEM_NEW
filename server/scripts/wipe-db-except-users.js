const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function wipeDatabase() {
  console.log('Connecting to database...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':****@') : 'MISSING');

  // 1. Check User table before
  const usersBefore = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true }
  });
  console.log(`\nExisting users before wipe (${usersBefore.length}):`);
  usersBefore.forEach(u => console.log(`  - [${u.role}] ${u.username} (${u.email})`));

  if (usersBefore.length === 0) {
    console.warn('WARNING: No users found in User table!');
  }

  // 2. Check outward foreign keys on User table
  const userOutwardFKs = await prisma.$queryRaw`
    SELECT
      tc.constraint_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'User'
      AND tc.table_schema = 'public';
  `;
  console.log(`\nOutward foreign keys from User table: ${userOutwardFKs.length}`);
  if (userOutwardFKs.length > 0) {
    console.log(userOutwardFKs);
  }

  // 3. Find all tables to truncate
  const tables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('User', '_prisma_migrations')
    ORDER BY table_name;
  `;

  const tableNames = tables.map(t => t.table_name);
  console.log(`\nFound ${tableNames.length} tables to truncate:`);
  console.log(tableNames.join(', '));

  if (tableNames.length === 0) {
    console.log('No tables to truncate.');
    return;
  }

  // 4. Construct TRUNCATE statement
  // Quoting table names preserves case sensitivity (e.g. "Category", "Product", etc.)
  const truncateSql = `TRUNCATE TABLE ${tableNames.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`;

  console.log('\nExecuting TRUNCATE statement...');
  await prisma.$executeRawUnsafe(truncateSql);
  console.log('TRUNCATE executed successfully.');

  // 5. Verify results
  console.log('\n--- VERIFICATION POST-WIPE ---');
  const allTables = await prisma.$queryRaw`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;

  let totalNonUsersRows = 0;
  for (const t of allTables) {
    const countRes = await prisma.$queryRawUnsafe(`SELECT count(*)::int as count FROM "${t.table_name}"`);
    const count = countRes[0].count;
    console.log(`${t.table_name}: ${count} rows`);
    if (t.table_name !== 'User' && t.table_name !== '_prisma_migrations') {
      totalNonUsersRows += count;
    }
  }

  const usersAfter = await prisma.user.findMany({
    select: { id: true, username: true, email: true, role: true }
  });
  console.log(`\nRemaining users after wipe (${usersAfter.length}):`);
  usersAfter.forEach(u => console.log(`  - [${u.role}] ${u.username} (${u.email})`));

  console.log('--------------------------------------------------');
  if (totalNonUsersRows === 0 && usersAfter.length === usersBefore.length) {
    console.log('SUCCESS: All data wiped from DASHPOS except users table.');
  } else {
    console.error(`INCONSISTENCY: totalNonUsersRows=${totalNonUsersRows}, usersAfter=${usersAfter.length}`);
  }
}

wipeDatabase()
  .catch(err => {
    console.error('Migration wipe failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
