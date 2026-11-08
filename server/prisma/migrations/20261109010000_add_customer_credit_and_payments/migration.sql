-- AlterEnum PaymentMethod: add CREDIT
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'CREDIT';

-- AlterEnum PaymentStatus: add PARTIALLY_PAID
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';

-- AlterTable Sale: add amount_paid and balance_due
ALTER TABLE "Sale" ADD COLUMN "amount_paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "balance_due" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill existing Sale records:
-- If COMPLETED, amount_paid = total_amount, balance_due = 0
-- If PENDING, amount_paid = 0, balance_due = total_amount
UPDATE "Sale"
SET
  amount_paid = total_amount,
  balance_due = 0
WHERE payment_status = 'COMPLETED';

UPDATE "Sale"
SET
  amount_paid = 0,
  balance_due = total_amount
WHERE payment_status = 'PENDING';

-- CreateTable CustomerPayment
CREATE TABLE "CustomerPayment" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable CustomerPaymentAllocation
CREATE TABLE "CustomerPaymentAllocation" (
    "id" TEXT NOT NULL,
    "customer_payment_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerPaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerPayment_customer_id_idx" ON "CustomerPayment"("customer_id");
CREATE INDEX "CustomerPayment_created_at_idx" ON "CustomerPayment"("created_at");

-- CreateIndex
CREATE INDEX "CustomerPaymentAllocation_customer_payment_id_idx" ON "CustomerPaymentAllocation"("customer_payment_id");
CREATE INDEX "CustomerPaymentAllocation_sale_id_idx" ON "CustomerPaymentAllocation"("sale_id");

-- AddForeignKey
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPayment" ADD CONSTRAINT "CustomerPayment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_customer_payment_id_fkey" FOREIGN KEY ("customer_payment_id") REFERENCES "CustomerPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerPaymentAllocation" ADD CONSTRAINT "CustomerPaymentAllocation_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
