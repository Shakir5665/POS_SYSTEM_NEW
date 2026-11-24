-- AlterTable Expense
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "is_cancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cancelled_by" TEXT;
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "cancellation_reason" TEXT;