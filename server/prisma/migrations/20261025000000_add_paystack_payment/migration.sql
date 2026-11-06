-- CreateTable
CREATE TABLE "PaystackPayment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "channel" TEXT,
    "customer_email" TEXT,
    "paid_at" TIMESTAMP(3),
    "sale_id" TEXT,
    "refund_requested_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaystackPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaystackPayment_reference_key" ON "PaystackPayment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PaystackPayment_sale_id_key" ON "PaystackPayment"("sale_id");

-- AddForeignKey
ALTER TABLE "PaystackPayment" ADD CONSTRAINT "PaystackPayment_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

