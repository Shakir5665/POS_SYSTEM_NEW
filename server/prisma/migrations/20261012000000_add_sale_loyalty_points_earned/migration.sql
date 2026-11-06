-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "loyalty_points_earned" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing customer sales. The rate in force at the time of each
-- sale wasn't recorded, so use the current loyalty_points_rate setting
-- (default 10), which is what refunds used before this column existed.
UPDATE "Sale"
SET "loyalty_points_earned" = FLOOR(
  "total_amount" / COALESCE(
    (SELECT NULLIF("value", '')::numeric
       FROM "Settings"
      WHERE "key" = 'loyalty_points_rate'
        AND "value" ~ '^[0-9]+(\.[0-9]+)?$'
        AND "value"::numeric > 0),
    10
  )
)::INTEGER
WHERE "customer_id" IS NOT NULL;
