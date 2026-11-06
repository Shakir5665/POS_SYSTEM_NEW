-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "refund_requested_at" TIMESTAMP(3),
ADD COLUMN     "refund_requested_by" TEXT;
