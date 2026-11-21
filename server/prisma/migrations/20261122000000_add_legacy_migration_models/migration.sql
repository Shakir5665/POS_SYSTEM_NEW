-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "is_legacy_import" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_date" TIMESTAMP(3),
ADD COLUMN     "warehouse_id" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sale_date" TIMESTAMP(3),
ADD COLUMN     "warehouse_id" TEXT;

-- CreateTable
CREATE TABLE "LegacyIdMap" (
    "id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'legacy_pos',
    "entity_type" TEXT NOT NULL,
    "legacy_id" TEXT NOT NULL,
    "target_model" TEXT NOT NULL,
    "nextill_id" TEXT NOT NULL,
    "batch_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyIdMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationBatch" (
    "id" TEXT NOT NULL,
    "batch_number" SERIAL NOT NULL,
    "source_file" TEXT,
    "source_sha256" TEXT,
    "entity_type" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 0,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rollback_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MigrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationIssue" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "legacy_id" TEXT,
    "issue_code" TEXT,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "resolution_status" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MigrationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustment" (
    "id" TEXT NOT NULL,
    "adjustment_number" TEXT,
    "adjustment_date" TIMESTAMP(3) NOT NULL,
    "warehouse_id" TEXT,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "notes" TEXT,
    "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockAdjustmentItem" (
    "id" TEXT NOT NULL,
    "adjustment_id" TEXT NOT NULL,
    "product_id" TEXT,
    "quantity_change" DECIMAL(14,3) NOT NULL,
    "method_type" INTEGER,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyIdMap_entity_type_nextill_id_idx" ON "LegacyIdMap"("entity_type", "nextill_id");

-- CreateIndex
CREATE INDEX "LegacyIdMap_target_model_nextill_id_idx" ON "LegacyIdMap"("target_model", "nextill_id");

-- CreateIndex
CREATE INDEX "LegacyIdMap_batch_id_idx" ON "LegacyIdMap"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyIdMap_source_system_entity_type_legacy_id_key" ON "LegacyIdMap"("source_system", "entity_type", "legacy_id");

-- CreateIndex
CREATE UNIQUE INDEX "MigrationBatch_batch_number_key" ON "MigrationBatch"("batch_number");

-- CreateIndex
CREATE INDEX "MigrationBatch_entity_type_idx" ON "MigrationBatch"("entity_type");

-- CreateIndex
CREATE INDEX "MigrationBatch_status_idx" ON "MigrationBatch"("status");

-- CreateIndex
CREATE INDEX "MigrationIssue_batch_id_idx" ON "MigrationIssue"("batch_id");

-- CreateIndex
CREATE INDEX "MigrationIssue_entity_type_legacy_id_idx" ON "MigrationIssue"("entity_type", "legacy_id");

-- CreateIndex
CREATE INDEX "MigrationIssue_severity_idx" ON "MigrationIssue"("severity");

-- CreateIndex
CREATE INDEX "MigrationIssue_issue_code_idx" ON "MigrationIssue"("issue_code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_name_key" ON "Warehouse"("name");

-- CreateIndex
CREATE INDEX "Warehouse_is_default_idx" ON "Warehouse"("is_default");

-- CreateIndex
CREATE UNIQUE INDEX "StockAdjustment_adjustment_number_key" ON "StockAdjustment"("adjustment_number");

-- CreateIndex
CREATE INDEX "StockAdjustment_adjustment_date_idx" ON "StockAdjustment"("adjustment_date");

-- CreateIndex
CREATE INDEX "StockAdjustment_warehouse_id_idx" ON "StockAdjustment"("warehouse_id");

-- CreateIndex
CREATE INDEX "StockAdjustmentItem_adjustment_id_idx" ON "StockAdjustmentItem"("adjustment_id");

-- CreateIndex
CREATE INDEX "StockAdjustmentItem_product_id_idx" ON "StockAdjustmentItem"("product_id");

-- CreateIndex
CREATE INDEX "Purchase_purchase_date_idx" ON "Purchase"("purchase_date");

-- CreateIndex
CREATE INDEX "Purchase_warehouse_id_idx" ON "Purchase"("warehouse_id");

-- CreateIndex
CREATE INDEX "Sale_sale_date_idx" ON "Sale"("sale_date");

-- CreateIndex
CREATE INDEX "Sale_warehouse_id_idx" ON "Sale"("warehouse_id");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyIdMap" ADD CONSTRAINT "LegacyIdMap_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "MigrationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationIssue" ADD CONSTRAINT "MigrationIssue_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "MigrationBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustment" ADD CONSTRAINT "StockAdjustment_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "StockAdjustment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockAdjustmentItem" ADD CONSTRAINT "StockAdjustmentItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
