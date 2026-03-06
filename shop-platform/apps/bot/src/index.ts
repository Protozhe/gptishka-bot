import { loadBotEnv } from "@gptishka/config";
import { Bot, Context, InlineKeyboard, session, SessionFlavor } from "grammy";
import { ApiClient, type BotLocale } from "./lib/api";
import { t } from "./bot/i18n";

interface PromoDraft {
  productId: string;
  code: string;
  finalAmountRub: number;
  discountAmountRub: number;
}

interface SupportDraft {
  step: "subject" | "message";
  subject?: string;
}

interface SessionData {
  locale: BotLocale;
  menuMessageId?: number;
  awaitingPromoForProductId?: string;
  promoDraft?: PromoDraft;
  supportDraft?: SupportDraft;
}

type BotContext = Context & SessionFlavor<SessionData>;

const env = loadBotEnv(process.env);
const api = new ApiClient(env.API_BASE_URL);
const bot = new Bot<BotContext>(env.BOT_TOKEN);
const TELEGRAM_TEXT_LIMIT = 3900;

bot.use(
  session({
    initial: (): SessionData => ({
      locale: env.DEFAULT_LOCALE
    })
  })
);

bot.callbackQuery(/.*/, async (ctx, next) => {
  await answerCallbackFast(ctx);
  await next();
});

function getStartPayload(text?: string): string | undefined {
  if (!text) return undefined;
  const parts = text.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : undefined;
}

async function deleteUserMessage(ctx: BotContext): Promise<void> {
  if (!ctx.message?.message_id || !ctx.chat?.id) return;
  try {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch {
    // ignore deletion errors
  }
}

async function render(
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
  options?: { disableWebPreview?: boolean; forceNewMessage?: boolean }
): Promise<void> {
  const extra = {
    parse_mode: "HTML" as const,
    link_preview_options: { is_disabled: options?.disableWebPreview ?? true },
    reply_markup: keyboard
  };

  if (!options?.forceNewMessage && ctx.callbackQuery?.message) {
    try {
      await ctx.editMessageText(text, extra);
      ctx.session.menuMessageId = ctx.callbackQuery.message.message_id;
      return;
    } catch {
      // fallback below
    }
  }

  if (ctx.chat?.id && ctx.session.menuMessageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.menuMessageId);
    } catch {
      // ignore
    }
  }

  const message = await ctx.reply(text, extra);
  ctx.session.menuMessageId = message.message_id;
}

async function answerCallbackFast(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;
  try {
    await ctx.answerCallbackQuery();
  } catch {
    // ignore duplicate/expired callback answers
  }
}

function getAnchorMessageId(ctx: BotContext): number | undefined {
  if (ctx.callbackQuery?.message?.message_id) return ctx.callbackQuery.message.message_id;
  if (ctx.message?.message_id) return ctx.message.message_id;
  return ctx.session.menuMessageId;
}

async function clearChatHistory(ctx: BotContext, lookback = 300): Promise<void> {
  if (!ctx.chat?.id) return;

  const anchorMessageId = getAnchorMessageId(ctx);
  if (!anchorMessageId) return;

  const minMessageId = Math.max(1, anchorMessageId - lookback + 1);
  const ids: number[] = [];
  for (let id = anchorMessageId; id >= minMessageId; id -= 1) {
    ids.push(id);
  }

  const rawApi = (ctx.api as unknown as { raw?: { deleteMessages?: (chatId: number, messageIds: number[]) => Promise<unknown> } }).raw;

  if (rawApi?.deleteMessages) {
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        await rawApi.deleteMessages(ctx.chat.id, chunk);
      } catch {
        for (const messageId of chunk) {
          try {
            await ctx.api.deleteMessage(ctx.chat.id, messageId);
          } catch {
            // ignore deletion errors
          }
        }
      }
    }
  } else {
    for (const messageId of ids) {
      try {
        await ctx.api.deleteMessage(ctx.chat.id, messageId);
      } catch {
        // ignore deletion errors
      }
    }
  }

  ctx.session.menuMessageId = undefined;
}

function splitLongText(text: string, maxLength = TELEGRAM_TEXT_LIMIT): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = "";
  const lines = normalized.split("\n");

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }

    if (current) {
      pushCurrent();
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    let rest = line;
    while (rest.length > maxLength) {
      const slice = rest.slice(0, maxLength);
      const splitBySpace = slice.lastIndexOf(" ");
      const splitIndex = splitBySpace > Math.floor(maxLength * 0.5) ? splitBySpace : maxLength;
      chunks.push(rest.slice(0, splitIndex).trim());
      rest = rest.slice(splitIndex).trimStart();
    }
    current = rest;
  }

  if (current) {
    pushCurrent();
  }

  return chunks.length > 0 ? chunks : [normalized];
}

async function renderLong(
  ctx: BotContext,
  text: string,
  keyboard: InlineKeyboard,
  options?: { disableWebPreview?: boolean }
): Promise<void> {
  const parts = splitLongText(text);
  if (parts.length <= 1) {
    await render(ctx, text, keyboard, options);
    return;
  }

  if (ctx.chat?.id && ctx.session.menuMessageId) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.menuMessageId);
    } catch {
      // ignore
    }
  }
  ctx.session.menuMessageId = undefined;

  for (let i = 0; i < parts.length; i += 1) {
    const isLast = i === parts.length - 1;
    const sent = await ctx.reply(parts[i], {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: options?.disableWebPreview ?? true },
      reply_markup: isLast ? keyboard : undefined
    });
    if (isLast) {
      ctx.session.menuMessageId = sent.message_id;
    }
  }
}

function mainKeyboard(locale: BotLocale): InlineKeyboard {
  const lang = t(locale);
  return new InlineKeyboard()
    .text(lang.buy, "menu:buy")
    .text(lang.products, "menu:products")
    .row()
    .text(lang.reviews, "menu:reviews")
    .text(lang.support, "menu:support")
    .row()
    .text(lang.faq, "menu:faq")
    .text(lang.privacy, "menu:privacy")
    .row()
    .text(lang.language, "menu:language")
    .text(lang.clearChat, "menu:clear_chat");
}

function backToMainKeyboard(locale: BotLocale): InlineKeyboard {
  return new InlineKeyboard().text(t(locale).mainMenu, "menu:main");
}

function productListKeyboard(locale: BotLocale, products: Array<{ id: string; name: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const product of products) {
    keyboard.text(product.name, `pv:${product.id}`).row();
  }
  keyboard.text(t(locale).mainMenu, "menu:main");
  return keyboard;
}

function productDetailKeyboard(locale: BotLocale, productId: string): InlineKeyboard {
  const lang = t(locale);
  return new InlineKeyboard()
    .text(lang.applyPromo, `pc:${productId}`)
    .text(lang.pay, `pp:${productId}`)
    .row()
    .text(lang.back, "menu:products")
    .text(lang.mainMenu, "menu:main");
}

function paymentKeyboard(locale: BotLocale, paymentUrl: string): InlineKeyboard {
  const lang = t(locale);
  return new InlineKeyboard()
    .url(lang.pay, paymentUrl)
    .row()
    .text(lang.checkOrders, "menu:orders")
    .text(lang.mainMenu, "menu:main");
}

async function renderMain(ctx: BotContext, options?: { forceNewMessage?: boolean }): Promise<void> {
  const locale = ctx.session.locale;
  const lang = t(locale);
  const text = `<b>${lang.headline}</b>\n\n${lang.subheadline}\n\n<b>${lang.menuPrompt}</b>`;
  await render(ctx, text, mainKeyboard(locale), { forceNewMessage: options?.forceNewMessage });
}

async function renderProducts(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const products = await api.getProducts(locale);

  const lines = products.map((product) => {
    const oldPrice = product.oldPriceRub ? ` <s>${product.oldPriceRub} ₽</s>` : "";
    const discount = product.benefitRub ? ` (−${product.benefitRub} ₽)` : "";
    return `• <b>${product.name}</b> — ${product.priceRub} ₽${oldPrice}${discount}\n${product.shortDescription}`;
  });

  const text = `${t(locale).openTariffs}\n\n${lines.join("\n\n")}`;
  const keyboard = productListKeyboard(
    locale,
    products.map((product) => ({ id: product.id, name: product.name }))
  );

  await render(ctx, text, keyboard);
}

async function renderProductDetails(ctx: BotContext, productId: string): Promise<void> {
  const locale = ctx.session.locale;
  const product = await api.getProduct(productId, locale);
  const promo = ctx.session.promoDraft && ctx.session.promoDraft.productId === productId ? ctx.session.promoDraft : undefined;

  const priceBlock = promo
    ? `<b>${t(locale).promoApplied}:</b> ${promo.code}\nСкидка: ${promo.discountAmountRub} ₽\nИтог: <b>${promo.finalAmountRub} ₽</b>`
    : `Цена: <b>${product.priceRub} ₽</b>${product.oldPriceRub ? ` <s>${product.oldPriceRub} ₽</s>` : ""}`;

  const text = `<b>${product.name}</b>\n\n${product.description}\n\n<b>Преимущества:</b> ${product.advantages}\n<b>Срок:</b> ${product.durationDays} дней\n<b>Активация:</b> ${product.activationFormat}\n<b>Гарантия:</b> ${product.guarantee}\n\n${priceBlock}`;

  await render(ctx, text, productDetailKeyboard(locale, productId));
}

async function renderOrders(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const telegramId = String(ctx.from?.id || "");
  const orders = await api.getMyOrders(telegramId);

  if (orders.length === 0) {
    await render(ctx, t(locale).noOrders, backToMainKeyboard(locale));
    return;
  }

  const text = orders
    .slice(0, 10)
    .map((order) => {
      const delivery = order.deliveryContent ? `\nТокен: <code>${order.deliveryContent}</code>` : "";
      return `#${order.orderNumber} | ${order.productName}\n${order.amountRub} ₽ | ${order.status}${delivery}`;
    })
    .join("\n\n");

  await render(ctx, `<b>${t(locale).myOrders}</b>\n\n${text}`, backToMainKeyboard(locale));
}

async function renderReviews(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const reviews = await api.getReviews(locale);
  const top = reviews.slice(0, 6);

  const list = top
    .map((review) => `• <b>${review.authorName}</b> (${review.rating}/5)\n${review.text}`)
    .join("\n\n");

  const keyboard = new InlineKeyboard()
    .url("Открыть канал отзывов", "https://t.me/otzivigptishkashop")
    .row()
    .text(t(locale).mainMenu, "menu:main");

  await render(ctx, `<b>${t(locale).reviewsTitle}</b>\n\n${list}`, keyboard, { disableWebPreview: false });
}

async function renderFaq(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const faq = await api.getFaq(locale);

  const text = faq
    .slice(0, 8)
    .map((item, idx) => `${idx + 1}. <b>${item.question}</b>\n${item.answer}`)
    .join("\n\n");

  await render(ctx, `<b>${t(locale).faqTitle}</b>\n\n${text}`, backToMainKeyboard(locale));
}

async function renderPrivacy(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const privacy = await api.getPrivacy(locale);
  await renderLong(ctx, `<b>${t(locale).privacyTitle}</b>\n\n${privacy.text}`, backToMainKeyboard(locale));
}

async function renderSupport(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const support = await api.getSupportLink(locale);

  const keyboard = new InlineKeyboard()
    .url(t(locale).support, support.link)
    .row()
    .text("Создать тикет", "support:new")
    .text(t(locale).mainMenu, "menu:main");

  await render(ctx, t(locale).supportIntro, keyboard, { disableWebPreview: false });
}

async function renderLanguage(ctx: BotContext): Promise<void> {
  const locale = ctx.session.locale;
  const keyboard = new InlineKeyboard()
    .text("Русский", "lang:ru")
    .text("English", "lang:en")
    .row()
    .text(t(locale).mainMenu, "menu:main");

  await render(ctx, t(locale).changeLanguage, keyboard);
}

bot.command("start", async (ctx) => {
  const startPayload = getStartPayload(ctx.message?.text);

  const started = await api.start({
    telegramId: String(ctx.from.id),
    username: ctx.from.username,
    firstName: ctx.from.first_name,
    lastName: ctx.from.last_name,
    locale: ctx.session.locale,
    startPayload
  });

  ctx.session.locale = started.user.locale;
  ctx.session.awaitingPromoForProductId = undefined;
  ctx.session.promoDraft = undefined;
  ctx.session.supportDraft = undefined;

  await renderMain(ctx);
});

bot.command("clear", async (ctx) => {
  ctx.session.awaitingPromoForProductId = undefined;
  ctx.session.promoDraft = undefined;
  ctx.session.supportDraft = undefined;
  await deleteUserMessage(ctx);
  await clearChatHistory(ctx);
  await renderMain(ctx, { forceNewMessage: true });
});

bot.command("id", async (ctx) => {
  await ctx.reply(`${t(ctx.session.locale).idLabel} <code>${ctx.from.id}</code>`, { parse_mode: "HTML" });
});

bot.command("orders", async (ctx) => {
  await renderOrders(ctx);
});

bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
  const action = ctx.match[1];

  if (action === "main") {
    await renderMain(ctx);
    return;
  }

  if (action === "buy" || action === "products") {
    await renderProducts(ctx);
    return;
  }

  if (action === "reviews") {
    await renderReviews(ctx);
    return;
  }

  if (action === "support") {
    await renderSupport(ctx);
    return;
  }

  if (action === "faq") {
    await renderFaq(ctx);
    return;
  }

  if (action === "privacy") {
    await renderPrivacy(ctx);
    return;
  }

  if (action === "language") {
    await renderLanguage(ctx);
    return;
  }

  if (action === "orders") {
    await renderOrders(ctx);
    return;
  }

  if (action === "clear_chat") {
    ctx.session.awaitingPromoForProductId = undefined;
    ctx.session.promoDraft = undefined;
    ctx.session.supportDraft = undefined;
    await clearChatHistory(ctx);
    await renderMain(ctx, { forceNewMessage: true });
    return;
  }
});

bot.callbackQuery(/^pv:(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  ctx.session.awaitingPromoForProductId = undefined;
  await renderProductDetails(ctx, productId);
});

bot.callbackQuery(/^pc:(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  ctx.session.awaitingPromoForProductId = productId;

  await render(
    ctx,
    `${t(ctx.session.locale).promoAsk}\n\nProduct: <code>${productId}</code>`,
    new InlineKeyboard().text(t(ctx.session.locale).back, `pv:${productId}`).text(t(ctx.session.locale).mainMenu, "menu:main")
  );
});

bot.callbackQuery(/^pp:(.+)$/, async (ctx) => {
  const productId = ctx.match[1];
  const promoCode = ctx.session.promoDraft?.productId === productId ? ctx.session.promoDraft.code : undefined;
  const locale = ctx.session.locale;

  const order = await api.createOrder({
    telegramId: String(ctx.from.id),
    productId,
    promoCode
  });

  const payment = await api.createPayment({
    orderId: order.orderId,
    telegramId: String(ctx.from.id)
  });

  const text = `${t(locale).paymentReady}\n\n#${order.orderNumber}\nСумма: <b>${order.amountRub} ₽</b>`;
  await render(ctx, text, paymentKeyboard(locale, payment.paymentUrl), { disableWebPreview: false });
});

bot.callbackQuery(/^lang:(ru|en)$/, async (ctx) => {
  const locale = ctx.match[1] as BotLocale;
  await api.setLanguage({
    telegramId: String(ctx.from.id),
    locale
  });

  ctx.session.locale = locale;
  await render(ctx, t(locale).languageUpdated, backToMainKeyboard(locale));
});

bot.callbackQuery("support:new", async (ctx) => {
  ctx.session.supportDraft = { step: "subject" };
  await render(ctx, t(ctx.session.locale).supportTicketSubjectAsk, backToMainKeyboard(ctx.session.locale));
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) {
    return;
  }

  const locale = ctx.session.locale;

  if (ctx.session.awaitingPromoForProductId) {
    const productId = ctx.session.awaitingPromoForProductId;
    const code = ctx.message.text.trim();

    try {
      const promo = await api.validatePromo({
        telegramId: String(ctx.from.id),
        productId,
        promoCode: code
      });

      ctx.session.promoDraft = {
        productId,
        code: promo.promoCode,
        finalAmountRub: promo.finalAmountRub,
        discountAmountRub: promo.discountAmountRub
      };

      ctx.session.awaitingPromoForProductId = undefined;
      await deleteUserMessage(ctx);
      await renderProductDetails(ctx, productId);
      return;
    } catch {
      await deleteUserMessage(ctx);
      await render(ctx, t(locale).promoInvalid, backToMainKeyboard(locale));
      return;
    }
  }

  if (ctx.session.supportDraft?.step === "subject") {
    ctx.session.supportDraft = {
      step: "message",
      subject: ctx.message.text.trim()
    };
    await deleteUserMessage(ctx);
    await render(ctx, t(locale).supportTicketMessageAsk, backToMainKeyboard(locale));
    return;
  }

  if (ctx.session.supportDraft?.step === "message") {
    const subject = ctx.session.supportDraft.subject || "Support request";
    const message = ctx.message.text.trim();

    const ticket = await api.createSupportTicket({
      telegramId: String(ctx.from.id),
      subject,
      message
    });

    ctx.session.supportDraft = undefined;
    await deleteUserMessage(ctx);
    await render(ctx, `${t(locale).supportTicketCreated}${ticket.ticketId}`, backToMainKeyboard(locale));
    return;
  }

  await deleteUserMessage(ctx);
  await renderMain(ctx);
});

bot.catch((error) => {
  console.error("Bot error", error.error);
});

async function bootstrap() {
  await bot.api.setMyCommands([
    { command: "start", description: "Open main menu" },
    { command: "orders", description: "My orders" },
    { command: "clear", description: "Clear chat and reset flow" },
    { command: "id", description: "Show Telegram ID" }
  ]);

  await bot.start();
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
