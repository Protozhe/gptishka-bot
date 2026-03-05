export enum Locale {
  RU = "ru",
  EN = "en"
}

export enum OrderStatus {
  CREATED = "created",
  PENDING_PAYMENT = "pending_payment",
  PAID = "paid",
  ISSUED = "issued",
  PROCESSING = "processing",
  CANCELED = "canceled",
  ERROR = "error",
  REFUND = "refund"
}

export enum ProductDeliveryType {
  INSTANT_TOKEN = "instant_token",
  INVENTORY = "inventory",
  MANUAL = "manual"
}

export enum PromoType {
  PERCENT = "percent",
  FIXED = "fixed"
}

export enum TicketStatus {
  OPEN = "open",
  IN_PROGRESS = "in_progress",
  WAITING_USER = "waiting_user",
  CLOSED = "closed"
}

export enum AdminRole {
  SUPERADMIN = "superadmin",
  ADMIN = "admin",
  SUPPORT = "support"
}

export interface Money {
  currency: string;
  amount: number;
}

export interface PriceBreakdown {
  initialAmount: number;
  finalAmount: number;
  discountAmount: number;
  promoCode?: string;
}

export interface Pagination {
  page: number;
  pageSize: number;
}
