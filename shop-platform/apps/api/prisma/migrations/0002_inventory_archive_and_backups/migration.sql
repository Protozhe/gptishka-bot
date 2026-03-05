-- AlterTable
ALTER TABLE "DeliveryItem"
ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedBy" TEXT;

-- CreateTable
CREATE TABLE "InventoryBackup" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "createdBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryBackup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBackup_snapshotDate_key" ON "InventoryBackup"("snapshotDate");

-- CreateIndex
CREATE INDEX "InventoryBackup_createdAt_idx" ON "InventoryBackup"("createdAt");

-- CreateIndex
CREATE INDEX "DeliveryItem_productId_isArchived_idx" ON "DeliveryItem"("productId", "isArchived");
