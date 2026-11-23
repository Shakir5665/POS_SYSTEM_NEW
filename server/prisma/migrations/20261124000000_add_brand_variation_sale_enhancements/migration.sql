-- CreateTable Brand
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Brand_name_key" ON "Brand"("name");

-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN "brand_id" TEXT;
CREATE INDEX "Product_brand_id_idx" ON "Product"("brand_id");
ALTER TABLE "Product" ADD CONSTRAINT "Product_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Variation
CREATE TABLE "Variation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Variation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Variation_name_key" ON "Variation"("name");

-- CreateTable VariationValue
CREATE TABLE "VariationValue" (
    "id" TEXT NOT NULL,
    "variation_id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariationValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VariationValue_variation_id_idx" ON "VariationValue"("variation_id");
CREATE UNIQUE INDEX "VariationValue_variation_id_value_key" ON "VariationValue"("variation_id", "value");
ALTER TABLE "VariationValue" ADD CONSTRAINT "VariationValue_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "Variation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable Payment
ALTER TABLE "Payment" ADD COLUMN "is_void" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN "void_reason" TEXT;
ALTER TABLE "Payment" ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "voided_by" TEXT;

-- AlterTable CustomerPayment
ALTER TABLE "CustomerPayment" ADD COLUMN "is_void" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerPayment" ADD COLUMN "void_reason" TEXT;
ALTER TABLE "CustomerPayment" ADD COLUMN "voided_at" TIMESTAMP(3);
ALTER TABLE "CustomerPayment" ADD COLUMN "voided_by" TEXT;

-- AlterTable Sale
ALTER TABLE "Sale" ADD COLUMN "is_cancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Sale" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "Sale" ADD COLUMN "cancellation_reason" TEXT;

-- AlterTable SalesReturn
ALTER TABLE "SalesReturn" ADD COLUMN "is_cancelled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesReturn" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "SalesReturn" ADD COLUMN "cancelled_by" TEXT;
ALTER TABLE "SalesReturn" ADD COLUMN "cancellation_reason" TEXT;
