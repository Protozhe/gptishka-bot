-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ru', 'en');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('superadmin', 'admin', 'support');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'pending_payment', 'paid', 'issued', 'processing', 'canceled', 'error', 'refund');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('created', 'pending', 'paid', 'failed', 'canceled', 'refunded');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('instant_token', 'inventory', 'manual');

-- CreateEnum
CREATE TYPE "PromoType" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('open', 'in_progress', 'waiting_user', 'closed');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'ru',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "sourceTag" TEXT,
    "refCode" TEXT,
    "firstStartPayload" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "shortDescriptionRu" TEXT NOT NULL,
    "shortDescriptionEn" TEXT NOT NULL,
    "descriptionRu" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "advantagesRu" TEXT NOT NULL,
    "advantagesEn" TEXT NOT NULL,
    "activationFormatRu" TEXT NOT NULL,
    "activationFormatEn" TEXT NOT NULL,
    "guaranteeRu" TEXT NOT NULL,
    "guaranteeEn" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "priceRub" INTEGER NOT NULL,
    "oldPriceRub" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "deliveryType" "DeliveryType" NOT NULL,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "stockCount" INTEGER,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "PromoType" NOT NULL,
    "value" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOneTime" BOOLEAN NOT NULL DEFAULT false,
    "onlyNewUsers" BOOLEAN NOT NULL DEFAULT false,
    "maxActivations" INTEGER,
    "perUserLimit" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCodeProduct" (
    "promoCodeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "PromoCodeProduct_pkey" PRIMARY KEY ("promoCodeId","productId")
);

-- CreateTable
CREATE TABLE "PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "discountAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderNumber" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "amountRub" INTEGER NOT NULL,
    "initialAmountRub" INTEGER NOT NULL,
    "discountAmountRub" INTEGER NOT NULL DEFAULT 0,
    "promoCodeId" TEXT,
    "promoCodeText" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "paymentDueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "errorReason" TEXT,
    "adminComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'created',
    "amountRub" INTEGER NOT NULL,
    "payload" JSONB,
    "paidAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "secretValue" TEXT NOT NULL,
    "meta" JSONB,
    "isReserved" BOOLEAN NOT NULL DEFAULT false,
    "reservedUntil" TIMESTAMP(3),
    "isIssued" BOOLEAN NOT NULL DEFAULT false,
    "issuedAt" TIMESTAMP(3),
    "issuedOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL,
    "tokenOrContent" TEXT,
    "instructionRu" TEXT,
    "instructionEn" TEXT,
    "externalUrl" TEXT,
    "deliveredBy" TEXT NOT NULL DEFAULT 'system',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "textRu" TEXT NOT NULL,
    "textEn" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FAQItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "questionRu" TEXT NOT NULL,
    "answerRu" TEXT NOT NULL,
    "questionEn" TEXT NOT NULL,
    "answerEn" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FAQItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'open',
    "priority" "TicketPriority" NOT NULL DEFAULT 'normal',
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT,
    "adminUserId" TEXT,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" "Locale",
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_sortOrder_idx" ON "ProductCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_isActive_sortOrder_idx" ON "Product"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_isActive_expiresAt_idx" ON "PromoCode"("isActive", "expiresAt");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_createdAt_idx" ON "PromoCodeUsage"("promoCodeId", "createdAt");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_userId_createdAt_idx" ON "PromoCodeUsage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_productId_idx" ON "Order"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_provider_providerPaymentId_idx" ON "Payment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryItem_issuedOrderId_key" ON "DeliveryItem"("issuedOrderId");

-- CreateIndex
CREATE INDEX "DeliveryItem_productId_isIssued_isReserved_idx" ON "DeliveryItem"("productId", "isIssued", "isReserved");

-- CreateIndex
CREATE UNIQUE INDEX "OrderDelivery_orderId_key" ON "OrderDelivery"("orderId");

-- CreateIndex
CREATE INDEX "Review_isPublished_isPinned_sortOrder_idx" ON "Review"("isPublished", "isPinned", "sortOrder");

-- CreateIndex
CREATE INDEX "FAQItem_isPublished_category_sortOrder_idx" ON "FAQItem"("isPublished", "category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_orderId_key" ON "SupportTicket"("orderId");

-- CreateIndex
CREATE INDEX "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_assigneeId_status_idx" ON "SupportTicket"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_locale_key" ON "Setting"("key", "locale");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeProduct" ADD CONSTRAINT "PromoCodeProduct_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeProduct" ADD CONSTRAINT "PromoCodeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryItem" ADD CONSTRAINT "DeliveryItem_issuedOrderId_fkey" FOREIGN KEY ("issuedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

