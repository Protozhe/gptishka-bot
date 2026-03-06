import type { FastifyInstance } from "fastify";
import { Locale } from "@prisma/client";
import { z } from "zod";
import { createPaymentProvider } from "../payments/provider.factory";
import { badRequest, notFound } from "../../lib/http-error";
import { createOrderDraft, ensureUserByTelegramId } from "../../services/order.service";
import { createPaymentForOrder } from "../../services/payment.service";
import { validatePromoForOrder } from "../../services/promo.service";

const localeSchema = z.enum(["ru", "en"]);

const startSchema = z.object({
  telegramId: z.string().min(3),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  locale: localeSchema.optional(),
  startPayload: z.string().optional()
});

const promoValidateSchema = z.object({
  telegramId: z.string().min(3),
  productId: z.string().min(1),
  promoCode: z.string().min(2)
});

const createOrderSchema = z.object({
  telegramId: z.string().min(3),
  productId: z.string().min(1),
  promoCode: z.string().optional()
});

const createTicketSchema = z.object({
  telegramId: z.string().min(3),
  subject: z.string().min(3),
  message: z.string().min(3),
  orderId: z.string().optional()
});

const createTicketMessageSchema = z.object({
  telegramId: z.string().min(3),
  body: z.string().min(1)
});

const setLangSchema = z.object({
  telegramId: z.string().min(3),
  locale: localeSchema
});

function normalizeLocale(raw?: string): Locale {
  return raw === "en" ? Locale.en : Locale.ru;
}

function textByLocale(locale: Locale, ru: string, en: string): string {
  return locale === Locale.en ? en : ru;
}

export async function registerBotRoutes(app: FastifyInstance): Promise<void> {
  const provider = createPaymentProvider(app.ctx.env);

  app.post("/start", async (request) => {
    const body = startSchema.parse(request.body);

    const user = await ensureUserByTelegramId(app.ctx.prisma, {
      telegramId: body.telegramId,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,
      locale: body.locale,
      startPayload: body.startPayload
    });

    return {
      user: {
        telegramId: user.telegramId,
        locale: user.locale
      },
      hero: {
        title: textByLocale(
          user.locale,
          "Добро пожаловать в сервис активации ChatGPT GPTишка",
          "ChatGPT activation and renewal in minutes"
        ),
        subtitle: textByLocale(
          user.locale,
          "Подключение и продление подписки занимает всего несколько минут.\nБез сложных действий, всё работает автоматически.",
          "Fast subscription activation with no extra steps. Convenient, secure, and supported end-to-end."
        )
      },
      menu: {
        buy: textByLocale(user.locale, "Купить", "Buy"),
        products: textByLocale(user.locale, "Товары", "Products"),
        reviews: textByLocale(user.locale, "Отзывы", "Reviews"),
        support: textByLocale(user.locale, "Поддержка", "Support"),
        faq: textByLocale(user.locale, "FAQ", "FAQ"),
        privacy: textByLocale(user.locale, "Политика конфиденциальности", "Privacy policy"),
        language: textByLocale(user.locale, "Смена языка", "Language")
      }
    };
  });

  app.post("/language", async (request) => {
    const body = setLangSchema.parse(request.body);
    const locale = normalizeLocale(body.locale);

    const user = await app.ctx.prisma.user.update({
      where: { telegramId: body.telegramId },
      data: { locale }
    });

    return { telegramId: user.telegramId, locale: user.locale };
  });

  app.get("/products", async (request) => {
    const q = request.query as {
      locale?: string;
      categoryId?: string;
      activeOnly?: string;
      minPrice?: string;
      maxPrice?: string;
      durationDays?: string;
      sort?: "price_asc" | "price_desc" | "popular";
    };

    const locale = normalizeLocale(q.locale);

    const where: any = {
      isActive: q.activeOnly === "false" ? undefined : true,
      categoryId: q.categoryId || undefined,
      priceRub: {
        gte: q.minPrice ? Number(q.minPrice) : undefined,
        lte: q.maxPrice ? Number(q.maxPrice) : undefined
      },
      durationDays: q.durationDays ? Number(q.durationDays) : undefined
    };

    const orderBy =
      q.sort === "price_asc"
        ? [{ priceRub: "asc" as const }]
        : q.sort === "price_desc"
          ? [{ priceRub: "desc" as const }]
          : [{ sortOrder: "asc" as const }];

    const products = await app.ctx.prisma.product.findMany({
      where,
      orderBy,
      include: { category: true }
    });

    return products.map((product) => ({
      id: product.id,
      sku: product.sku,
      slug: product.slug,
      name: locale === Locale.en ? product.titleEn : product.titleRu,
      shortDescription: locale === Locale.en ? product.shortDescriptionEn : product.shortDescriptionRu,
      durationDays: product.durationDays,
      priceRub: product.priceRub,
      oldPriceRub: product.oldPriceRub,
      benefitRub: product.oldPriceRub ? product.oldPriceRub - product.priceRub : null,
      category: {
        id: product.category.id,
        title: locale === Locale.en ? product.category.titleEn : product.category.titleRu
      },
      deliveryType: product.deliveryType,
      isActive: product.isActive
    }));
  });

  app.get("/products/:id", async (request) => {
    const { id } = request.params as { id: string };
    const { locale: localeRaw } = request.query as { locale?: string };
    const locale = normalizeLocale(localeRaw);

    const product = await app.ctx.prisma.product.findUnique({ where: { id } });
    if (!product || !product.isActive) {
      throw notFound("Product not found");
    }

    return {
      id: product.id,
      name: locale === Locale.en ? product.titleEn : product.titleRu,
      description: locale === Locale.en ? product.descriptionEn : product.descriptionRu,
      advantages: locale === Locale.en ? product.advantagesEn : product.advantagesRu,
      durationDays: product.durationDays,
      activationFormat: locale === Locale.en ? product.activationFormatEn : product.activationFormatRu,
      guarantee: locale === Locale.en ? product.guaranteeEn : product.guaranteeRu,
      priceRub: product.priceRub,
      oldPriceRub: product.oldPriceRub,
      canApplyPromo: true,
      actions: {
        applyPromo: locale === Locale.en ? "Apply promo code" : "Применить промокод",
        pay: locale === Locale.en ? "Pay" : "Оплатить",
        back: locale === Locale.en ? "Back" : "Назад"
      }
    };
  });

  app.post("/promos/validate", async (request) => {
    const body = promoValidateSchema.parse(request.body);

    const user = await app.ctx.prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) {
      throw notFound("User not found");
    }

    const product = await app.ctx.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.isActive) {
      throw notFound("Product not found");
    }

    const result = await validatePromoForOrder({
      prisma: app.ctx.prisma,
      userId: user.id,
      productId: product.id,
      amountRub: product.priceRub,
      promoCode: body.promoCode
    });

    return {
      promoCode: result.promoCode,
      initialAmountRub: result.initialAmount,
      discountAmountRub: result.discountAmount,
      finalAmountRub: result.finalAmount,
      discountPercent: result.initialAmount > 0 ? Math.round((result.discountAmount / result.initialAmount) * 100) : 0
    };
  });

  app.post("/orders", async (request) => {
    const body = createOrderSchema.parse(request.body);

    const order = await createOrderDraft({
      prisma: app.ctx.prisma,
      telegramId: body.telegramId,
      productId: body.productId,
      promoCode: body.promoCode
    });

    return order;
  });

  app.post("/orders/:orderId/pay", async (request) => {
    const { orderId } = request.params as { orderId: string };
    const { telegramId } = request.body as { telegramId?: string };

    if (!telegramId) {
      throw badRequest("telegramId is required");
    }

    const order = await app.ctx.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: true }
    });

    if (!order) {
      throw notFound("Order not found");
    }

    if (order.user.telegramId !== telegramId) {
      throw badRequest("Order does not belong to user");
    }

    const payment = await createPaymentForOrder({
      prisma: app.ctx.prisma,
      provider,
      orderId
    });

    return payment;
  });

  app.get("/orders/my/:telegramId", async (request) => {
    const { telegramId } = request.params as { telegramId: string };
    const user = await app.ctx.prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      return [];
    }

    const orders = await app.ctx.prisma.order.findMany({
      where: { userId: user.id },
      include: {
        product: true,
        delivery: true,
        payment: true
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return orders.map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      productName: user.locale === Locale.en ? order.product.titleEn : order.product.titleRu,
      amountRub: order.amountRub,
      date: order.createdAt,
      status: order.status,
      deliveryContent: order.delivery?.tokenOrContent,
      instruction: user.locale === Locale.en ? order.delivery?.instructionEn : order.delivery?.instructionRu,
      paymentStatus: order.payment?.status || null
    }));
  });

  app.get("/reviews", async (request) => {
    const { locale: localeRaw } = request.query as { locale?: string };
    const locale = normalizeLocale(localeRaw);

    const reviews = await app.ctx.prisma.review.findMany({
      where: { isPublished: true },
      orderBy: [{ isPinned: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }]
    });

    return reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      text: locale === Locale.en ? review.textEn || review.textRu : review.textRu,
      rating: review.rating,
      pinned: review.isPinned
    }));
  });

  app.get("/faq", async (request) => {
    const { locale: localeRaw } = request.query as { locale?: string };
    const locale = normalizeLocale(localeRaw);

    const items = await app.ctx.prisma.fAQItem.findMany({
      where: { isPublished: true },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }]
    });

    return items.map((item) => ({
      id: item.id,
      category: item.category,
      question: locale === Locale.en ? item.questionEn : item.questionRu,
      answer: locale === Locale.en ? item.answerEn : item.answerRu
    }));
  });

  app.get("/privacy", async (request) => {
    const { locale: localeRaw } = request.query as { locale?: string };
    const locale = normalizeLocale(localeRaw);

    const setting = await app.ctx.prisma.setting.findUnique({
      where: {
        key_locale: {
          key: "privacy_policy",
          locale
        }
      }
    });

    return {
      text:
        setting?.value ||
        textByLocale(locale, "Политика конфиденциальности скоро будет опубликована.", "Privacy policy will be published soon.")
    };
  });

  app.get("/support/link", async (request) => {
    const { locale: localeRaw } = request.query as { locale?: string };
    const locale = normalizeLocale(localeRaw);
    const setting = await app.ctx.prisma.setting.findUnique({
      where: {
        key_locale: {
          key: "support_link",
          locale
        }
      }
    });

    return {
      link: setting?.value || "https://t.me/gptishkasupp"
    };
  });

  app.post("/support/tickets", async (request) => {
    const body = createTicketSchema.parse(request.body);

    const user = await app.ctx.prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) {
      throw notFound("User not found");
    }

    if (body.orderId) {
      const order = await app.ctx.prisma.order.findUnique({ where: { id: body.orderId } });
      if (!order || order.userId !== user.id) {
        throw badRequest("Order not found for user");
      }
    }

    const ticket = await app.ctx.prisma.supportTicket.create({
      data: {
        userId: user.id,
        orderId: body.orderId,
        subject: body.subject,
        messages: {
          create: {
            userId: user.id,
            body: body.message
          }
        }
      },
      include: { messages: true }
    });

    return {
      ticketId: ticket.id,
      status: ticket.status
    };
  });

  app.post("/support/tickets/:ticketId/messages", async (request) => {
    const { ticketId } = request.params as { ticketId: string };
    const body = createTicketMessageSchema.parse(request.body);

    const user = await app.ctx.prisma.user.findUnique({ where: { telegramId: body.telegramId } });
    if (!user) {
      throw notFound("User not found");
    }

    const ticket = await app.ctx.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== user.id) {
      throw badRequest("Ticket not found");
    }

    await app.ctx.prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        body: body.body
      }
    });

    await app.ctx.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: "open" }
    });

    return { ok: true };
  });

  app.get("/support/tickets/:telegramId", async (request) => {
    const { telegramId } = request.params as { telegramId: string };
    const user = await app.ctx.prisma.user.findUnique({ where: { telegramId } });
    if (!user) {
      return [];
    }

    const tickets = await app.ctx.prisma.supportTicket.findMany({
      where: { userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" }
    });

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        from: message.adminUserId ? "admin" : "user"
      }))
    }));
  });
}
