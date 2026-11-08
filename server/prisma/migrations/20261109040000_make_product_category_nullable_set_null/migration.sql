-- AlterTable: make category_id nullable on Product
ALTER TABLE "Product" ALTER COLUMN "category_id" DROP NOT NULL;

-- Drop existing foreign key constraint if present
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_category_id_fkey";

-- Re-add foreign key with ON DELETE SET NULL
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
