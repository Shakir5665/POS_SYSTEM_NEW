const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const salesService = require('./src/services/salesService.js');

async function main() {
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const sugar = await prisma.product.findFirst({ where: { name: 'Sugar' } });

  console.log('Admin user:', adminUser.id);
  console.log('Sugar product:', sugar);

  // Let's simulate calculateReceiptSummary on what salesService returns
  // Wait, let's call salesService.createSale inside a transaction that we roll back!
  try {
    await prisma.$transaction(async (tx) => {
      // Mock create sale
      const payload = {
        items: [
          {
            product_id: sugar.id,
            quantity: 20,
            unit: 'g',
            predefined_discount_applied: true,
            our_price: 235,
            discount: 0
          }
        ],
        payment_method: 'CASH',
        amount_paid: 10,
        discount_amount: 0
      };

      // Let's create sale
      const sale = await salesService.createSale(payload, adminUser.id);
      console.log('Created sale:');
      console.log('Subtotal:', sale.subtotal.toString());
      console.log('Total:', sale.total_amount.toString());
      console.log('Sale item:');
      for (const it of sale.sale_items) {
        console.log({
          name: it.product_name,
          qty: it.quantity.toString(),
          unit: it.unit,
          pricing_unit: it.pricing_unit,
          unit_price: it.unit_price.toString(),
          usual_price: it.usual_price_snapshot?.toString(),
          our_price: it.our_price_snapshot?.toString(),
          predefined_discount_amount: it.predefined_discount_amount.toString(),
          total: it.total.toString(),
          product: it.product
        });
      }

      const { getReceiptDataModel } = await import('../client/src/utils/receiptModel.js');
      const model = getReceiptDataModel(sale);
      console.log('RECEIPT MODEL SUMMARY:');
      console.log(JSON.stringify(model.summary, null, 2));
      console.log('RECEIPT MODEL ITEMS:');
      console.log(JSON.stringify(model.items, null, 2));

      // Rollback so we don't mess up DB
      throw new Error('ROLLBACK_TEST');
    });
  } catch (err) {
    if (err.message !== 'ROLLBACK_TEST') console.error('Error:', err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
