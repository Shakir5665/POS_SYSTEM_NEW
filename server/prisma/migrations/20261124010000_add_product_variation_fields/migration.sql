-- AlterTable Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "variation_id" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "variation_value" TEXT;
CREATE INDEX IF NOT EXISTS "Product_variation_id_idx" ON "Product"("variation_id");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_variation_id_fkey') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
