-- CreateEnum
CREATE TYPE "UnitCategory" AS ENUM ('COUNT', 'WEIGHT', 'VOLUME');

-- AlterTable
ALTER TABLE "InventoryLog" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs',
ALTER COLUMN "quantity_change" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "previous_quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "new_quantity" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "base_unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "pricing_unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "unit_category" "UnitCategory" NOT NULL DEFAULT 'COUNT',
ALTER COLUMN "quantity" SET DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "low_stock_threshold" SET DEFAULT 10,
ALTER COLUMN "low_stock_threshold" SET DATA TYPE DECIMAL(14,3);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "base_quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
ADD COLUMN "base_unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "line_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "pricing_unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "product_name" TEXT NOT NULL DEFAULT '',
ADD COLUMN "product_sku" TEXT NOT NULL DEFAULT '',
ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'pcs',
ADD COLUMN "unit_cost_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,3);

-- Backfill existing SaleItem records from Product
UPDATE "SaleItem" si
SET
  product_name = p.name,
  product_sku = p.sku,
  base_quantity = si.quantity,
  unit_cost_snapshot = COALESCE(p.cost_price, 0),
  line_cost = si.quantity * COALESCE(p.cost_price, 0)
FROM "Product" p
WHERE si.product_id = p.id;
