-- AlterTable Product: add usual_price and our_price
ALTER TABLE "Product" ADD COLUMN "usual_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "our_price" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill existing Product records:
-- usual_price = price
-- our_price = price
-- cost_price is NOT modified (preserving NULL and existing values)
-- price is preserved unchanged
UPDATE "Product"
SET
  usual_price = price,
  our_price = price;

-- AlterTable SaleItem: add pricing snapshots and predefined discount tracking
ALTER TABLE "SaleItem" ADD COLUMN "cost_price_snapshot" DECIMAL(10,2),
ADD COLUMN "usual_price_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "our_price_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "predefined_discount_applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "predefined_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill existing SaleItem records:
-- unit_price, unit_cost_snapshot, line_cost, discount, total remain unchanged
-- usual_price_snapshot = unit_price
-- our_price_snapshot = unit_price
-- cost_price_snapshot = unit_cost_snapshot
-- predefined_discount_applied = false
-- predefined_discount_amount = 0
UPDATE "SaleItem"
SET
  usual_price_snapshot = unit_price,
  our_price_snapshot = unit_price,
  cost_price_snapshot = unit_cost_snapshot,
  predefined_discount_applied = false,
  predefined_discount_amount = 0;
