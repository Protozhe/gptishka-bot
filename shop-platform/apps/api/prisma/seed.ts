import { PrismaClient, AdminRole, DeliveryType, Locale, PromoType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash(process.env.ADMIN_SEED_PASSWORD || "ChangeMe_123456", 12);

  await prisma.adminUser.upsert({
    where: { email: "owner@gptishka.local" },
    update: {},
    create: {
      email: "owner@gptishka.local",
      name: "Owner",
      role: AdminRole.superadmin,
      passwordHash: adminPassword
    }
  });

  const category = await prisma.productCategory.upsert({
    where: { slug: "chatgpt-subscriptions" },
    update: {},
    create: {
      slug: "chatgpt-subscriptions",
      titleRu: "Подписки ChatGPT",
      titleEn: "ChatGPT Subscriptions",
      descriptionRu: "Быстрое подключение и продление подписок",
      descriptionEn: "Fast activation and renewal",
      sortOrder: 1
    }
  });

  const products = [
    {
      sku: "CGPT-PLUS-30",
      slug: "chatgpt-plus-30",
      titleRu: "ChatGPT Plus",
      titleEn: "ChatGPT Plus",
      shortDescriptionRu: "Базовый тариф для ежедневных задач",
      shortDescriptionEn: "Base plan for daily tasks",
      descriptionRu: "Стабильный доступ, высокая скорость ответа и поддержка файлов.",
      descriptionEn: "Stable access, fast response and file support.",
      advantagesRu: "Приоритет, файлы, изображения",
      advantagesEn: "Priority, files, images",
      activationFormatRu: "Код активации в боте",
      activationFormatEn: "Activation code via bot",
      guaranteeRu: "Гарантия на весь оплаченный период",
      guaranteeEn: "Guaranteed for the paid period",
      durationDays: 30,
      priceRub: 1499,
      oldPriceRub: 2290,
      deliveryType: DeliveryType.inventory,
      stockCount: 100,
      sortOrder: 1
    },
    {
      sku: "CGPT-GO-30",
      slug: "chatgpt-go-30",
      titleRu: "ChatGPT GO",
      titleEn: "ChatGPT GO",
      shortDescriptionRu: "Расширенные лимиты и функции",
      shortDescriptionEn: "Extended limits and features",
      descriptionRu: "Больше возможностей генерации и продвинутые модели.",
      descriptionEn: "More generation capabilities and advanced models.",
      advantagesRu: "Расширенные лимиты, ускоренные ответы",
      advantagesEn: "Extended limits, faster responses",
      activationFormatRu: "Код активации в боте",
      activationFormatEn: "Activation code via bot",
      guaranteeRu: "Гарантия на весь оплаченный период",
      guaranteeEn: "Guaranteed for the paid period",
      durationDays: 30,
      priceRub: 2499,
      oldPriceRub: 3190,
      deliveryType: DeliveryType.inventory,
      stockCount: 80,
      sortOrder: 2
    },
    {
      sku: "CGPT-PRO-30",
      slug: "chatgpt-pro-30",
      titleRu: "ChatGPT Pro",
      titleEn: "ChatGPT Pro",
      shortDescriptionRu: "Максимальный пакет для работы",
      shortDescriptionEn: "Maximum package for professional use",
      descriptionRu: "Повышенные лимиты и стабильность для длинных диалогов.",
      descriptionEn: "Higher limits and stability for long conversations.",
      advantagesRu: "Максимальные лимиты, premium-поддержка",
      advantagesEn: "Maximum limits, premium support",
      activationFormatRu: "Ручная проверка и выдача",
      activationFormatEn: "Manual verification and issuance",
      guaranteeRu: "Гарантия и сопровождение",
      guaranteeEn: "Guarantee and support",
      durationDays: 30,
      priceRub: 3499,
      oldPriceRub: 4590,
      deliveryType: DeliveryType.manual,
      requiresManualReview: true,
      sortOrder: 3
    }
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: product,
      create: { ...product, categoryId: category.id }
    });
  }

  const promo = await prisma.promoCode.upsert({
    where: { code: "WELCOME34" },
    update: {
      isActive: true,
      type: PromoType.percent,
      value: 34,
      onlyNewUsers: true,
      isOneTime: true,
      perUserLimit: 1
    },
    create: {
      code: "WELCOME34",
      type: PromoType.percent,
      value: 34,
      isActive: true,
      onlyNewUsers: true,
      isOneTime: true,
      perUserLimit: 1
    }
  });

  const productIds = await prisma.product.findMany({ select: { id: true } });
  for (const product of productIds) {
    await prisma.promoCodeProduct.upsert({
      where: {
        promoCodeId_productId: {
          promoCodeId: promo.id,
          productId: product.id
        }
      },
      update: {},
      create: {
        promoCodeId: promo.id,
        productId: product.id
      }
    });
  }

  const faq = [
    {
      category: "payment",
      questionRu: "Как подключается подписка?",
      answerRu:
        "После оплаты бот отправляет персональный код. Вы переходите в активацию, вставляете код, и система подключает тариф автоматически.",
      questionEn: "How is the subscription activated?",
      answerEn:
        "After payment, the bot sends a personal code. You open activation flow, paste the code, and system activates your plan automatically.",
      sortOrder: 1
    },
    {
      category: "security",
      questionRu: "Нужно ли передавать пароль?",
      answerRu: "Нет, логин и пароль не требуются. Активация выполняется безопасно через код.",
      questionEn: "Do I need to share password?",
      answerEn: "No, login and password are not required. Activation is securely done using a code.",
      sortOrder: 2
    }
  ];

  for (const item of faq) {
    await prisma.fAQItem.create({ data: item }).catch(() => null);
  }

  const reviews = [
    {
      authorName: "Алексей",
      textRu: "Подключили за 5 минут, все четко и без лишних действий.",
      textEn: "Activated in 5 minutes, smooth and clear process.",
      rating: 5,
      isPinned: true,
      sortOrder: 1
    },
    {
      authorName: "Maria",
      textRu: "Промокод сработал, поддержка отвечает быстро.",
      textEn: "Promo code worked, support team responds quickly.",
      rating: 5,
      sortOrder: 2
    }
  ];

  for (const review of reviews) {
    await prisma.review.create({ data: review }).catch(() => null);
  }

  const plus = await prisma.product.findUnique({ where: { sku: "CGPT-PLUS-30" } });
  if (plus) {
    for (let i = 1; i <= 20; i += 1) {
      await prisma.deliveryItem.create({
        data: {
          productId: plus.id,
          secretValue: `PLUS-TOKEN-${String(i).padStart(4, "0")}`,
          meta: { batch: "seed" }
        }
      }).catch(() => null);
    }
  }

  await prisma.setting.upsert({
    where: { key_locale: { key: "support_link", locale: Locale.ru } },
    update: { value: "https://t.me/gptishkasupp" },
    create: { key: "support_link", locale: Locale.ru, value: "https://t.me/gptishkasupp" }
  });

  await prisma.setting.upsert({
    where: { key_locale: { key: "privacy_policy", locale: Locale.ru } },
    update: { value: "Мы используем ваши данные только для обработки заказов и поддержки." },
    create: { key: "privacy_policy", locale: Locale.ru, value: "Мы используем ваши данные только для обработки заказов и поддержки." }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
