-- AlterTable
ALTER TABLE "InventoryLog" ADD COLUMN "warehouse_id" TEXT;

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "user_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "refund_status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "refund_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "refund_amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnItem" (
    "id" TEXT NOT NULL,
    "sales_return_id" TEXT NOT NULL,
    "sale_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL DEFAULT '',
    "product_sku" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(10,3) NOT NULL,
    "base_quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "refund_subtotal" DECIMAL(10,2) NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "disposition" TEXT NOT NULL DEFAULT 'RESTOCKED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "return_number" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "return_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "settlement_status" TEXT NOT NULL DEFAULT 'PENDING',
    "settlement_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "idempotency_key" TEXT,
    "is_legacy_import" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReturnItem" (
    "id" TEXT NOT NULL,
    "purchase_return_id" TEXT NOT NULL,
    "purchase_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL DEFAULT '',
    "product_sku" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "quantity" DECIMAL(10,3) NOT NULL,
    "base_quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "unit_cost" DECIMAL(10,2) NOT NULL,
    "total_cost" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_return_number_key" ON "SalesReturn"("return_number");
CREATE UNIQUE INDEX "SalesReturn_idempotency_key_key" ON "SalesReturn"("idempotency_key");
CREATE INDEX "SalesReturn_sale_id_idx" ON "SalesReturn"("sale_id");
CREATE INDEX "SalesReturn_customer_id_idx" ON "SalesReturn"("customer_id");
CREATE INDEX "SalesReturn_return_date_idx" ON "SalesReturn"("return_date");
CREATE INDEX "SalesReturn_warehouse_id_idx" ON "SalesReturn"("warehouse_id");

-- CreateIndex
CREATE INDEX "SalesReturnItem_sales_return_id_idx" ON "SalesReturnItem"("sales_return_id");
CREATE INDEX "SalesReturnItem_sale_item_id_idx" ON "SalesReturnItem"("sale_item_id");
CREATE INDEX "SalesReturnItem_product_id_idx" ON "SalesReturnItem"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReturn_return_number_key" ON "PurchaseReturn"("return_number");
CREATE UNIQUE INDEX "PurchaseReturn_idempotency_key_key" ON "PurchaseReturn"("idempotency_key");
CREATE INDEX "PurchaseReturn_purchase_id_idx" ON "PurchaseReturn"("purchase_id");
CREATE INDEX "PurchaseReturn_supplier_id_idx" ON "PurchaseReturn"("supplier_id");
CREATE INDEX "PurchaseReturn_return_date_idx" ON "PurchaseReturn"("return_date");
CREATE INDEX "PurchaseReturn_warehouse_id_idx" ON "PurchaseReturn"("warehouse_id");

-- CreateIndex
CREATE INDEX "PurchaseReturnItem_purchase_return_id_idx" ON "PurchaseReturnItem"("purchase_return_id");
CREATE INDEX "PurchaseReturnItem_purchase_item_id_idx" ON "PurchaseReturnItem"("purchase_item_id");
CREATE INDEX "PurchaseReturnItem_product_id_idx" ON "PurchaseReturnItem"("product_id");

-- CreateIndex
CREATE INDEX "InventoryLog_warehouse_id_idx" ON "InventoryLog"("warehouse_id");

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "SalesReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnItem" ADD CONSTRAINT "SalesReturnItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "PurchaseReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "PurchaseItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturnItem" ADD CONSTRAINT "PurchaseReturnItem_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
