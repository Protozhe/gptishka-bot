import type { FastifyInstance } from "fastify";
import { AdminRole, DeliveryType, OrderStatus, PromoType, TicketStatus } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../../lib/password";
import { badRequest, notFound } from "../../lib/http-error";
import { writeAudit } from "../../lib/audit";
import { deliverOrder } from "../../services/delivery.service";
import { createInventoryBackup, listInventoryBackups, restoreInventoryBackup } from "../../services/inventory-backup.service";

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const userUpdateSchema = z.object({
  isBlocked: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
  locale: z.enum(["ru", "en"]).optional()
});

const productCreateSchema = z.object({
  categoryId: z.string().min(1),
  sku: z.string().min(3),
  slug: z.string().min(3),
  titleRu: z.string().min(2),
  titleEn: z.string().min(2),
  shortDescriptionRu: z.string().min(2),
  shortDescriptionEn: z.string().min(2),
  descriptionRu: z.string().min(2),
  descriptionEn: z.string().min(2),
  advantagesRu: z.string().min(2),
  advantagesEn: z.string().min(2),
  activationFormatRu: z.string().min(2),
  activationFormatEn: z.string().min(2),
  guaranteeRu: z.string().min(2),
  guaranteeEn: z.string().min(2),
  durationDays: z.number().int().positive(),
  priceRub: z.number().int().positive(),
  oldPriceRub: z.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  deliveryType: z.nativeEnum(DeliveryType),
  requiresManualReview: z.boolean().optional(),
  stockCount: z.number().int().optional().nullable(),
  imageUrl: z.string().url().optional().nullable()
});

const productUpdateSchema = productCreateSchema.partial();

const orderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  adminComment: z.string().optional()
});

const manualIssueSchema = z.object({
  tokenOrContent: z.string().min(1),
  instructionRu: z.string().min(1),
  instructionEn: z.string().min(1)
});

const promoSchema = z.object({
  code: z.string().min(2).transform((value) => value.toUpperCase()),
  type: z.nativeEnum(PromoType),
  value: z.number().int().positive(),
  isActive: z.boolean().default(true),
  isOneTime: z.boolean().default(false),
  onlyNewUsers: z.boolean().default(false),
  maxActivations: z.number().int().positive().optional().nullable(),
  perUserLimit: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  productIds: z.array(z.string()).optional()
});

const reviewSchema = z.object({
  authorName: z.string().min(1),
  textRu: z.string().min(1),
  textEn: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5).default(5),
  isPublished: z.boolean().default(true),
  isPinned: z.boolean().default(false),
  sortOrder: z.number().int().default(100)
});

const faqSchema = z.object({
  category: z.string().min(1),
  questionRu: z.string().min(1),
  answerRu: z.string().min(1),
  questionEn: z.string().min(1),
  answerEn: z.string().min(1),
  isPublished: z.boolean().default(true),
  sortOrder: z.number().int().default(100)
});

const ticketMessageSchema = z.object({
  body: z.string().min(1),
  status: z.nativeEnum(TicketStatus).optional()
});

const settingSchema = z.object({
  key: z.string().min(1),
  locale: z.enum(["ru", "en"]),
  value: z.string().min(1)
});

const createAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10),
  name: z.string().min(2),
  role: z.nativeEnum(AdminRole)
});

const inventoryOverviewQuerySchema = z.object({
  search: z.string().trim().optional(),
  perProductLimit: z.coerce.number().int().min(1).max(200).default(25)
});

const inventoryUploadSchema = z.object({
  keysText: z.string().min(1)
});

const inventoryArchiveQuerySchema = z.object({
  search: z.string().trim().optional(),
  perProductLimit: z.coerce.number().int().min(1).max(200).default(25)
});

function paginate(input: z.infer<typeof paginationSchema>) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize
  };
}

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/dashboard", { preHandler: app.requireAdmin() }, async () => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      usersTotal,
      usersDay,
      ordersTotal,
      paidTotal,
      pendingCount,
      issuedCount,
      activePromos,
      problematicOrders,
      revenueDay,
      revenueWeek,
      revenueMonth,
      productsStats,
      promoStatsRaw,
      latestAudit
    ] = await Promise.all([
      app.ctx.prisma.user.count(),
      app.ctx.prisma.user.count({ where: { createdAt: { gte: dayAgo } } }),
      app.ctx.prisma.order.count(),
      app.ctx.prisma.order.count({ where: { status: { in: ["paid", "issued", "processing"] } } }),
      app.ctx.prisma.order.count({ where: { status: "pending_payment" } }),
      app.ctx.prisma.order.count({ where: { status: "issued" } }),
      app.ctx.prisma.promoCode.count({ where: { isActive: true } }),
      app.ctx.prisma.order.count({ where: { status: "error" } }),
      app.ctx.prisma.order.aggregate({ _sum: { amountRub: true }, where: { status: { in: ["paid", "issued", "processing"] }, paidAt: { gte: dayAgo } } }),
      app.ctx.prisma.order.aggregate({ _sum: { amountRub: true }, where: { status: { in: ["paid", "issued", "processing"] }, paidAt: { gte: weekAgo } } }),
      app.ctx.prisma.order.aggregate({ _sum: { amountRub: true }, where: { status: { in: ["paid", "issued", "processing"] }, paidAt: { gte: monthAgo } } }),
      app.ctx.prisma.order.groupBy({ by: ["productId"], _count: { productId: true }, orderBy: { _count: { productId: "desc" } }, take: 5 }),
      app.ctx.prisma.promoCode.findMany({
        include: {
          usages: {
            select: {
              discountAmount: true
            }
          }
        }
      }),
      app.ctx.prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 })
    ]);

    const productIds = productsStats.map((it) => it.productId);
    const promoStats = promoStatsRaw
      .map((promo) => ({
        promoCodeId: promo.id,
        code: promo.code,
        uses: promo.usages.length,
        totalDiscountRub: promo.usages.reduce((sum, usage) => sum + usage.discountAmount, 0)
      }))
      .sort((a, b) => b.uses - a.uses)
      .slice(0, 5);

    const productMap = await app.ctx.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, titleRu: true, titleEn: true }
    });

    return {
      kpis: {
        usersTotal,
        usersDay,
        ordersTotal,
        paidTotal,
        pendingCount,
        issuedCount,
        activePromos,
        problematicOrders,
        revenueDay: revenueDay._sum.amountRub || 0,
        revenueWeek: revenueWeek._sum.amountRub || 0,
        revenueMonth: revenueMonth._sum.amountRub || 0
      },
      topProducts: productsStats.map((it) => ({
        productId: it.productId,
        name: productMap.find((p) => p.id === it.productId)?.titleRu || it.productId,
        orders: (it._count as any).productId || 0
      })),
      promoConversion: promoStats,
      latestAudit
    };
  });

  app.get("/users", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const page = paginationSchema.parse(request.query);
    const { skip, take } = paginate(page);

    const [rows, total] = await Promise.all([
      app.ctx.prisma.user.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          orders: {
            select: {
              amountRub: true,
              status: true
            }
          }
        }
      }),
      app.ctx.prisma.user.count()
    ]);

    return {
      total,
      items: rows.map((user) => {
        const totalSpent = user.orders
          .filter((order) => ["paid", "issued", "processing"].includes(order.status))
          .reduce((sum, order) => sum + order.amountRub, 0);

        return {
          id: user.id,
          telegramId: user.telegramId,
          username: user.username,
          locale: user.locale,
          createdAt: user.createdAt,
          ordersCount: user.orders.length,
          totalSpent,
          isBlocked: user.isBlocked,
          notes: user.notes,
          sourceTag: user.sourceTag,
          refCode: user.refCode
        };
      })
    };
  });

  app.patch("/users/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = userUpdateSchema.parse(request.body);

    const user = await app.ctx.prisma.user.update({
      where: { id },
      data: body
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "user.update",
      resourceType: "user",
      resourceId: user.id,
      payload: body
    });

    return user;
  });

  app.get("/categories", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async () => {
    return app.ctx.prisma.productCategory.findMany({ orderBy: { sortOrder: "asc" } });
  });

  app.post("/categories", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = z
      .object({
        slug: z.string().min(2),
        titleRu: z.string().min(2),
        titleEn: z.string().min(2),
        descriptionRu: z.string().optional(),
        descriptionEn: z.string().optional(),
        isActive: z.boolean().optional(),
        sortOrder: z.number().int().optional()
      })
      .parse(request.body);

    const category = await app.ctx.prisma.productCategory.create({ data: body as any });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "category.create",
      resourceType: "category",
      resourceId: category.id,
      payload: body
    });

    return category;
  });

  app.get("/products", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async () => {
    return app.ctx.prisma.product.findMany({
      include: { category: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });
  });

  app.post("/products", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = productCreateSchema.parse(request.body);
    const created = await app.ctx.prisma.product.create({ data: body as any });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "product.create",
      resourceType: "product",
      resourceId: created.id,
      payload: body
    });

    return created;
  });

  app.patch("/products/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = productUpdateSchema.parse(request.body);

    const updated = await app.ctx.prisma.product.update({
      where: { id },
      data: body
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "product.update",
      resourceType: "product",
      resourceId: updated.id,
      payload: body
    });

    return updated;
  });

  app.delete("/products/:id", { preHandler: app.requireAdmin([AdminRole.superadmin]) }, async (request) => {
    const { id } = request.params as { id: string };

    await app.ctx.prisma.product.delete({ where: { id } });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "product.delete",
      resourceType: "product",
      resourceId: id
    });

    return { ok: true };
  });

  app.get("/inventory/overview", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const query = inventoryOverviewQuerySchema.parse(request.query);
    const now = new Date();
    const search = query.search?.trim();
    const orderNumberSearch = search && /^\d+$/.test(search) ? Number(search) : null;

    const products = await app.ctx.prisma.product.findMany({
      where: { deliveryType: DeliveryType.inventory },
      select: {
        id: true,
        sku: true,
        titleRu: true,
        titleEn: true,
        isActive: true,
        sortOrder: true
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });

    const cards = await Promise.all(
      products.map(async (product) => {
        const [unusedCount, reservedCount, issuedCount, totalCount] = await Promise.all([
          app.ctx.prisma.deliveryItem.count({
            where: {
              productId: product.id,
              isArchived: false,
              isIssued: false,
              OR: [{ isReserved: false }, { reservedUntil: { lt: now } }, { reservedUntil: null }]
            }
          }),
          app.ctx.prisma.deliveryItem.count({
            where: {
              productId: product.id,
              isArchived: false,
              isIssued: false,
              isReserved: true,
              reservedUntil: { gt: now }
            }
          }),
          app.ctx.prisma.deliveryItem.count({
            where: {
              productId: product.id,
              isArchived: false,
              isIssued: true
            }
          }),
          app.ctx.prisma.deliveryItem.count({ where: { productId: product.id, isArchived: false } })
        ]);

        const searchFilter = search
          ? {
              OR: [
                { secretValue: { contains: search, mode: "insensitive" as const } },
                { issuedOrderId: { contains: search, mode: "insensitive" as const } },
                { issuedOrder: { user: { telegramId: { contains: search } } } },
                ...(orderNumberSearch ? [{ issuedOrder: { orderNumber: orderNumberSearch } }] : [])
              ]
            }
          : {};

        const items = await app.ctx.prisma.deliveryItem.findMany({
          where: {
            productId: product.id,
            isArchived: false,
            ...searchFilter
          },
          include: {
            issuedOrder: {
              select: {
                id: true,
                orderNumber: true,
                createdAt: true,
                issuedAt: true,
                user: {
                  select: {
                    telegramId: true,
                    username: true
                  }
                }
              }
            }
          },
          orderBy: [{ isIssued: "asc" }, { createdAt: "asc" }],
          take: query.perProductLimit
        });

        return {
          productId: product.id,
          sku: product.sku,
          titleRu: product.titleRu,
          titleEn: product.titleEn,
          isActive: product.isActive,
          counts: {
            total: totalCount,
            unused: unusedCount,
            reserved: reservedCount,
            issued: issuedCount
          },
          items: items.map((item) => ({
            id: item.id,
            secretValue: item.secretValue,
            status: item.isIssued ? "issued" : item.isReserved && item.reservedUntil && item.reservedUntil > now ? "reserved" : "unused",
            isReserved: item.isReserved,
            reservedUntil: item.reservedUntil,
            isIssued: item.isIssued,
            createdAt: item.createdAt,
            issuedAt: item.issuedAt,
            issuedOrder: item.issuedOrder
              ? {
                  id: item.issuedOrder.id,
                  orderNumber: item.issuedOrder.orderNumber,
                  telegramId: item.issuedOrder.user.telegramId,
                  username: item.issuedOrder.user.username
                }
              : null
          }))
        };
      })
    );

    return cards;
  });

  app.get("/inventory/archive", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const query = inventoryArchiveQuerySchema.parse(request.query);
    const search = query.search?.trim();

    const products = await app.ctx.prisma.product.findMany({
      where: { deliveryType: DeliveryType.inventory },
      select: {
        id: true,
        sku: true,
        titleRu: true,
        isActive: true,
        sortOrder: true
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }]
    });

    const cards = await Promise.all(
      products.map(async (product) => {
        const archivedCount = await app.ctx.prisma.deliveryItem.count({
          where: {
            productId: product.id,
            isArchived: true
          }
        });

        const items = await app.ctx.prisma.deliveryItem.findMany({
          where: {
            productId: product.id,
            isArchived: true,
            ...(search ? { secretValue: { contains: search, mode: "insensitive" as const } } : {})
          },
          orderBy: [{ archivedAt: "desc" }, { createdAt: "desc" }],
          take: query.perProductLimit
        });

        return {
          productId: product.id,
          sku: product.sku,
          titleRu: product.titleRu,
          isActive: product.isActive,
          archivedCount,
          items: items.map((item) => ({
            id: item.id,
            secretValue: item.secretValue,
            archivedAt: item.archivedAt,
            archivedBy: item.archivedBy,
            createdAt: item.createdAt
          }))
        };
      })
    );

    return cards.filter((card) => card.archivedCount > 0 || Boolean(search));
  });

  app.get("/inventory/backups", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async () => {
    return listInventoryBackups(app.ctx.prisma, 7);
  });

  app.post("/inventory/backups/create", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const result = await createInventoryBackup(app.ctx.prisma, {
      createdBy: request.adminUser?.email || request.adminUser?.id || "admin",
      force: true
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "inventory.backup.create",
      resourceType: "inventory_backup",
      resourceId: result.backup.id,
      payload: {
        snapshotDate: result.backup.snapshotDate,
        itemCount: result.backup.itemCount,
        createdBy: result.backup.createdBy
      }
    });

    return result.backup;
  });

  app.post("/inventory/backups/:id/restore", { preHandler: app.requireAdmin([AdminRole.superadmin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await restoreInventoryBackup(app.ctx.prisma, id);

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "inventory.backup.restore",
      resourceType: "inventory_backup",
      resourceId: id,
      payload: result
    });

    return result;
  });

  app.post("/inventory/:productId/upload", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { productId } = request.params as { productId: string };
    const body = inventoryUploadSchema.parse(request.body);

    const product = await app.ctx.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, titleRu: true, deliveryType: true }
    });

    if (!product) {
      throw notFound("Товар не найден");
    }
    if (product.deliveryType !== DeliveryType.inventory) {
      throw badRequest("Для этого товара не используется склад ключей");
    }

    const submittedLines = body.keysText
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    if (submittedLines.length === 0) {
      throw badRequest("Не найдено ни одного ключа для загрузки");
    }
    if (submittedLines.length > 5000) {
      throw badRequest("Слишком много ключей за один раз. Лимит: 5000");
    }

    const uniqueLines = [...new Set(submittedLines)];
    const existing = await app.ctx.prisma.deliveryItem.findMany({
      where: {
        productId,
        secretValue: { in: uniqueLines }
      },
      select: { secretValue: true }
    });

    const existingSet = new Set(existing.map((item) => item.secretValue));
    const keysToCreate = uniqueLines.filter((value) => !existingSet.has(value));

    if (keysToCreate.length > 0) {
      await app.ctx.prisma.deliveryItem.createMany({
        data: keysToCreate.map((secretValue) => ({
          productId,
          secretValue,
          meta: {
            source: "admin_upload",
            importedBy: request.adminUser?.email || request.adminUser?.id || "admin",
            importedAt: new Date().toISOString()
          }
        }))
      });
    }

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "inventory.upload",
      resourceType: "inventory",
      resourceId: productId,
      payload: {
        productSku: product.sku,
        submitted: submittedLines.length,
        unique: uniqueLines.length,
        added: keysToCreate.length,
        duplicatesInBatch: submittedLines.length - uniqueLines.length,
        duplicatesInStorage: uniqueLines.length - keysToCreate.length
      }
    });

    return {
      productId,
      productSku: product.sku,
      submitted: submittedLines.length,
      unique: uniqueLines.length,
      added: keysToCreate.length,
      duplicatesInBatch: submittedLines.length - uniqueLines.length,
      duplicatesInStorage: uniqueLines.length - keysToCreate.length
    };
  });

  app.post("/inventory/:id/archive", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };

    const item = await app.ctx.prisma.deliveryItem.findUnique({
      where: { id },
      include: { product: { select: { sku: true, titleRu: true } } }
    });

    if (!item) {
      throw notFound("Ключ не найден");
    }

    if (item.isIssued || item.issuedOrderId) {
      throw badRequest("Нельзя отправить в архив уже выданный ключ");
    }
    if (item.isReserved && item.reservedUntil && item.reservedUntil > new Date()) {
      throw badRequest("Нельзя отправить в архив зарезервированный ключ");
    }
    if (item.isArchived) {
      return { ok: true, alreadyArchived: true };
    }

    await app.ctx.prisma.deliveryItem.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: request.adminUser?.email || request.adminUser?.id || "admin",
        isReserved: false,
        reservedUntil: null
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "inventory.archive",
      resourceType: "inventory",
      resourceId: id,
      payload: {
        productSku: item.product.sku,
        secretPreview: `${item.secretValue.slice(0, 4)}...${item.secretValue.slice(-4)}`
      }
    });

    return { ok: true };
  });

  app.post("/inventory/:id/purge", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const item = await app.ctx.prisma.deliveryItem.findUnique({
      where: { id },
      include: { product: { select: { sku: true, titleRu: true } } }
    });

    if (!item) {
      throw notFound("Ключ не найден");
    }
    if (!item.isArchived) {
      throw badRequest("Ключ можно удалить только из архива");
    }
    if (item.isIssued || item.issuedOrderId) {
      throw badRequest("Нельзя удалить уже выданный ключ");
    }

    await app.ctx.prisma.deliveryItem.delete({ where: { id } });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "inventory.purge",
      resourceType: "inventory",
      resourceId: id,
      payload: {
        productSku: item.product.sku,
        secretPreview: `${item.secretValue.slice(0, 4)}...${item.secretValue.slice(-4)}`
      }
    });

    return { ok: true };
  });
  app.get("/orders", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const query = z
      .object({
        status: z.nativeEnum(OrderStatus).optional(),
        productId: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        search: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20)
      })
      .parse(request.query);

    const where: any = {
      status: query.status,
      productId: query.productId,
      createdAt: {
        gte: query.from ? new Date(query.from) : undefined,
        lte: query.to ? new Date(query.to) : undefined
      }
    };

    if (query.search) {
      where.OR = [
        { id: { contains: query.search, mode: "insensitive" } },
        { user: { telegramId: { contains: query.search } } },
        { user: { username: { contains: query.search, mode: "insensitive" } } }
      ];
    }

    const { skip, take } = paginate({ page: query.page, pageSize: query.pageSize });

    const [rows, total] = await Promise.all([
      app.ctx.prisma.order.findMany({
        where,
        skip,
        take,
        include: {
          user: true,
          product: true,
          payment: true,
          delivery: true
        },
        orderBy: { createdAt: "desc" }
      }),
      app.ctx.prisma.order.count({ where })
    ]);

    return { total, items: rows };
  });

  app.get("/orders/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const order = await app.ctx.prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
        product: true,
        payment: true,
        delivery: true,
        promoCode: true
      }
    });

    if (!order) {
      throw notFound("Order not found");
    }

    return order;
  });

  app.patch("/orders/:id/status", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = orderStatusSchema.parse(request.body);

    const order = await app.ctx.prisma.order.update({
      where: { id },
      data: {
        status: body.status,
        adminComment: body.adminComment,
        paidAt: body.status === OrderStatus.paid ? new Date() : undefined,
        issuedAt: body.status === OrderStatus.issued ? new Date() : undefined
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "order.status.update",
      resourceType: "order",
      resourceId: order.id,
      payload: body
    });

    return order;
  });

  app.post("/orders/:id/manual-issue", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = manualIssueSchema.parse(request.body);

    const order = await app.ctx.prisma.order.findUnique({ where: { id }, include: { delivery: true } });
    if (!order) {
      throw notFound("Order not found");
    }

    if (order.delivery) {
      throw badRequest("Order already delivered");
    }

    await app.ctx.prisma.orderDelivery.create({
      data: {
        orderId: order.id,
        deliveryType: DeliveryType.manual,
        tokenOrContent: body.tokenOrContent,
        instructionRu: body.instructionRu,
        instructionEn: body.instructionEn,
        deliveredBy: request.adminUser?.id || "admin"
      }
    });

    const updatedOrder = await app.ctx.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.issued,
        issuedAt: new Date()
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "order.manual_issue",
      resourceType: "order",
      resourceId: order.id,
      payload: body
    });

    return updatedOrder;
  });

  app.post("/orders/:id/auto-deliver", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await deliverOrder(app.ctx.prisma, id);

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "order.auto_deliver",
      resourceType: "order",
      resourceId: id,
      payload: result
    });

    return result;
  });

  app.get("/promocodes", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async () => {
    const rows = await app.ctx.prisma.promoCode.findMany({
      include: {
        products: { include: { product: true } },
        usages: true
      },
      orderBy: { createdAt: "desc" }
    });

    return rows.map((row) => ({
      ...row,
      usageCount: row.usages.length,
      products: row.products.map((link) => ({ id: link.product.id, titleRu: link.product.titleRu }))
    }));
  });

  app.post("/promocodes", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = promoSchema.parse(request.body);

    const created = await app.ctx.prisma.promoCode.create({
      data: {
        code: body.code,
        type: body.type,
        value: body.value,
        isActive: body.isActive,
        isOneTime: body.isOneTime,
        onlyNewUsers: body.onlyNewUsers,
        maxActivations: body.maxActivations,
        perUserLimit: body.perUserLimit,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        products: body.productIds
          ? {
              create: body.productIds.map((productId) => ({ productId }))
            }
          : undefined
      },
      include: { products: true }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "promo.create",
      resourceType: "promocode",
      resourceId: created.id,
      payload: body
    });

    return created;
  });

  app.patch("/promocodes/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = promoSchema.partial().parse(request.body);

    const updated = await app.ctx.prisma.$transaction(async (tx) => {
      const promo = await tx.promoCode.update({
        where: { id },
        data: {
          code: body.code,
          type: body.type,
          value: body.value,
          isActive: body.isActive,
          isOneTime: body.isOneTime,
          onlyNewUsers: body.onlyNewUsers,
          maxActivations: body.maxActivations,
          perUserLimit: body.perUserLimit,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : body.expiresAt === null ? null : undefined
        }
      });

      if (body.productIds) {
        await tx.promoCodeProduct.deleteMany({ where: { promoCodeId: id } });
        if (body.productIds.length > 0) {
          await tx.promoCodeProduct.createMany({
            data: body.productIds.map((productId) => ({ promoCodeId: id, productId }))
          });
        }
      }

      return promo;
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "promo.update",
      resourceType: "promocode",
      resourceId: id,
      payload: body
    });

    return updated;
  });

  app.delete("/promocodes/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };

    await app.ctx.prisma.promoCode.delete({ where: { id } });
    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "promo.delete",
      resourceType: "promocode",
      resourceId: id
    });

    return { ok: true };
  });

  app.get("/reviews", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async () => {
    return app.ctx.prisma.review.findMany({ orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }] });
  });

  app.post("/reviews", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = reviewSchema.parse(request.body);
    const created = await app.ctx.prisma.review.create({ data: body as any });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "review.create",
      resourceType: "review",
      resourceId: created.id,
      payload: body
    });

    return created;
  });

  app.patch("/reviews/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = reviewSchema.partial().parse(request.body);

    const updated = await app.ctx.prisma.review.update({ where: { id }, data: body });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "review.update",
      resourceType: "review",
      resourceId: id,
      payload: body
    });

    return updated;
  });

  app.delete("/reviews/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    await app.ctx.prisma.review.delete({ where: { id } });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "review.delete",
      resourceType: "review",
      resourceId: id
    });

    return { ok: true };
  });

  app.get("/faq", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async () => {
    return app.ctx.prisma.fAQItem.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
  });

  app.post("/faq", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = faqSchema.parse(request.body);
    const created = await app.ctx.prisma.fAQItem.create({ data: body as any });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "faq.create",
      resourceType: "faq",
      resourceId: created.id,
      payload: body
    });

    return created;
  });

  app.patch("/faq/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = faqSchema.partial().parse(request.body);

    const updated = await app.ctx.prisma.fAQItem.update({ where: { id }, data: body });
    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "faq.update",
      resourceType: "faq",
      resourceId: id,
      payload: body
    });

    return updated;
  });

  app.delete("/faq/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const { id } = request.params as { id: string };
    await app.ctx.prisma.fAQItem.delete({ where: { id } });
    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "faq.delete",
      resourceType: "faq",
      resourceId: id
    });

    return { ok: true };
  });

  app.get("/tickets", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const query = z
      .object({
        status: z.nativeEnum(TicketStatus).optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20)
      })
      .parse(request.query);

    const { skip, take } = paginate({ page: query.page, pageSize: query.pageSize });

    return app.ctx.prisma.supportTicket.findMany({
      where: {
        status: query.status
      },
      include: {
        user: true,
        assignee: true,
        messages: { orderBy: { createdAt: "asc" }, take: 1 }
      },
      skip,
      take,
      orderBy: { updatedAt: "desc" }
    });
  });

  app.get("/tickets/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const ticket = await app.ctx.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: true,
        assignee: true,
        order: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!ticket) {
      throw notFound("Ticket not found");
    }

    return ticket;
  });

  app.post("/tickets/:id/messages", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = ticketMessageSchema.parse(request.body);

    const ticket = await app.ctx.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) {
      throw notFound("Ticket not found");
    }

    const message = await app.ctx.prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        adminUserId: request.adminUser?.id,
        body: body.body
      }
    });

    await app.ctx.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: body.status ?? TicketStatus.waiting_user,
        assigneeId: request.adminUser?.id
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "ticket.reply",
      resourceType: "ticket",
      resourceId: id,
      payload: body
    });

    return message;
  });

  app.patch("/tickets/:id", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin, AdminRole.support]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        status: z.nativeEnum(TicketStatus).optional(),
        priority: z.enum(["low", "normal", "high", "critical"]).optional(),
        assigneeId: z.string().nullable().optional()
      })
      .parse(request.body);

    const updated = await app.ctx.prisma.supportTicket.update({
      where: { id },
      data: {
        status: body.status,
        priority: body.priority,
        assigneeId: body.assigneeId
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "ticket.update",
      resourceType: "ticket",
      resourceId: id,
      payload: body
    });

    return updated;
  });

  app.get("/settings", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async () => {
    return app.ctx.prisma.setting.findMany({ orderBy: { key: "asc" } });
  });

  app.post("/settings", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const body = settingSchema.parse(request.body);

    const updated = await app.ctx.prisma.setting.upsert({
      where: {
        key_locale: {
          key: body.key,
          locale: body.locale
        }
      },
      update: { value: body.value },
      create: {
        key: body.key,
        locale: body.locale,
        value: body.value
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "setting.upsert",
      resourceType: "setting",
      resourceId: updated.id,
      payload: body
    });

    return updated;
  });

  app.get("/logs/audit", { preHandler: app.requireAdmin([AdminRole.superadmin, AdminRole.admin]) }, async (request) => {
    const page = paginationSchema.parse(request.query);
    const { skip, take } = paginate(page);

    const [rows, total] = await Promise.all([
      app.ctx.prisma.auditLog.findMany({
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          adminUser: {
            select: {
              email: true,
              role: true
            }
          }
        }
      }),
      app.ctx.prisma.auditLog.count()
    ]);

    return { total, items: rows };
  });

  app.get("/admins", { preHandler: app.requireAdmin([AdminRole.superadmin]) }, async () => {
    return app.ctx.prisma.adminUser.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true
      }
    });
  });

  app.post("/admins", { preHandler: app.requireAdmin([AdminRole.superadmin]) }, async (request) => {
    const body = createAdminSchema.parse(request.body);

    const existing = await app.ctx.prisma.adminUser.findUnique({ where: { email: body.email } });
    if (existing) {
      throw badRequest("Admin with this email already exists");
    }

    const admin = await app.ctx.prisma.adminUser.create({
      data: {
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password)
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "admin.create",
      resourceType: "admin",
      resourceId: admin.id,
      payload: { email: body.email, role: body.role }
    });

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      isActive: admin.isActive
    };
  });

  app.patch("/admins/:id", { preHandler: app.requireAdmin([AdminRole.superadmin]) }, async (request) => {
    const { id } = request.params as { id: string };
    const body = z
      .object({
        role: z.nativeEnum(AdminRole).optional(),
        isActive: z.boolean().optional(),
        password: z.string().min(10).optional(),
        name: z.string().min(2).optional()
      })
      .parse(request.body);

    const updated = await app.ctx.prisma.adminUser.update({
      where: { id },
      data: {
        role: body.role,
        isActive: body.isActive,
        name: body.name,
        passwordHash: body.password ? await hashPassword(body.password) : undefined
      }
    });

    await writeAudit(app.ctx.prisma, request, {
      adminUserId: request.adminUser?.id,
      action: "admin.update",
      resourceType: "admin",
      resourceId: id,
      payload: {
        role: body.role,
        isActive: body.isActive,
        name: body.name,
        passwordUpdated: Boolean(body.password)
      }
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
      isActive: updated.isActive
    };
  });
}

