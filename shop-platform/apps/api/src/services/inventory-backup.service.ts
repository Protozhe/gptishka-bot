import { DeliveryType, PrismaClient } from "@prisma/client";

interface BackupItem {
  productId: string;
  secretValue: string;
  meta: unknown;
  isReserved: boolean;
  reservedUntil: string | null;
  isIssued: boolean;
  issuedAt: string | null;
  issuedOrderId: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  archivedBy: string | null;
  createdAt: string;
}

function toSnapshotDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function createInventoryBackup(
  prisma: PrismaClient,
  options?: { createdBy?: string; snapshotDate?: Date; force?: boolean }
) {
  const snapshotDate = toSnapshotDate(options?.snapshotDate ?? new Date());
  const createdBy = options?.createdBy || "system";

  const existing = await prisma.inventoryBackup.findUnique({
    where: { snapshotDate }
  });

  if (existing && !options?.force) {
    return { backup: existing, created: false };
  }

  const items = await prisma.deliveryItem.findMany({
    where: {
      product: {
        deliveryType: DeliveryType.inventory
      }
    },
    select: {
      productId: true,
      secretValue: true,
      meta: true,
      isReserved: true,
      reservedUntil: true,
      isIssued: true,
      issuedAt: true,
      issuedOrderId: true,
      isArchived: true,
      archivedAt: true,
      archivedBy: true,
      createdAt: true
    },
    orderBy: [{ productId: "asc" }, { createdAt: "asc" }]
  });

  const snapshot: BackupItem[] = items.map((item) => ({
    productId: item.productId,
    secretValue: item.secretValue,
    meta: item.meta,
    isReserved: item.isReserved,
    reservedUntil: item.reservedUntil ? item.reservedUntil.toISOString() : null,
    isIssued: item.isIssued,
    issuedAt: item.issuedAt ? item.issuedAt.toISOString() : null,
    issuedOrderId: item.issuedOrderId,
    isArchived: item.isArchived,
    archivedAt: item.archivedAt ? item.archivedAt.toISOString() : null,
    archivedBy: item.archivedBy,
    createdAt: item.createdAt.toISOString()
  }));

  const backup = await prisma.inventoryBackup.upsert({
    where: { snapshotDate },
    update: {
      snapshot: snapshot as any,
      itemCount: snapshot.length,
      createdBy
    },
    create: {
      snapshotDate,
      snapshot: snapshot as any,
      itemCount: snapshot.length,
      createdBy
    }
  });

  const stale = await prisma.inventoryBackup.findMany({
    where: {
      snapshotDate: {
        lt: new Date(snapshotDate.getTime() - 7 * 24 * 60 * 60 * 1000)
      }
    },
    select: { id: true }
  });

  if (stale.length > 0) {
    await prisma.inventoryBackup.deleteMany({
      where: {
        id: { in: stale.map((row) => row.id) }
      }
    });
  }

  return { backup, created: true };
}

export async function listInventoryBackups(prisma: PrismaClient, limit = 7) {
  return prisma.inventoryBackup.findMany({
    orderBy: { snapshotDate: "desc" },
    take: limit,
    select: {
      id: true,
      snapshotDate: true,
      itemCount: true,
      createdBy: true,
      createdAt: true
    }
  });
}

export async function restoreInventoryBackup(prisma: PrismaClient, backupId: string) {
  const backup = await prisma.inventoryBackup.findUnique({
    where: { id: backupId }
  });
  if (!backup) {
    throw new Error("Backup not found");
  }

  const snapshotRaw = backup.snapshot as unknown;
  const snapshot = Array.isArray(snapshotRaw) ? (snapshotRaw as BackupItem[]) : [];
  const restorable = snapshot.filter((item) => !item.isIssued);

  await prisma.$transaction(async (tx) => {
    await tx.deliveryItem.deleteMany({
      where: {
        isIssued: false,
        product: {
          deliveryType: DeliveryType.inventory
        }
      }
    });

    if (restorable.length > 0) {
      await tx.deliveryItem.createMany({
        data: restorable.map((item) => ({
          productId: item.productId,
          secretValue: item.secretValue,
          meta: item.meta as any,
          isReserved: item.isReserved,
          reservedUntil: item.reservedUntil ? new Date(item.reservedUntil) : null,
          isIssued: false,
          issuedAt: null,
          issuedOrderId: null,
          isArchived: item.isArchived,
          archivedAt: item.archivedAt ? new Date(item.archivedAt) : null,
          archivedBy: item.archivedBy,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
        }))
      });
    }
  });

  return {
    backupId: backup.id,
    snapshotDate: backup.snapshotDate,
    restoredItems: restorable.length
  };
}

export async function ensureTodayInventoryBackup(prisma: PrismaClient): Promise<void> {
  await createInventoryBackup(prisma, { createdBy: "system", force: false });
}
