# GPTishka Platform (Telegram Shop + Admin)

Production-oriented monorepo for a Telegram mini-commerce shop with full admin panel.

## Stack

- Bot: `grammY` + TypeScript
- API: `Fastify` + TypeScript + Prisma
- Admin web: `Next.js` (App Router, dark SaaS UI)
- DB: `PostgreSQL`
- ORM: `Prisma`
- Auth: JWT access token + httpOnly refresh cookie
- Infra: Docker / docker-compose

## Monorepo structure

```text
shop-platform/
  apps/
    api/      # Fastify API + Prisma
    bot/      # Telegram bot flow
    admin/    # Next.js admin panel
  packages/
    shared/   # Shared enums/types/constants
    config/   # zod env loaders
```

## Features implemented

### Telegram bot funnel

- `/start` onboarding + main menu
- RU/EN language support with persistence
- Main sections:
  - Buy
  - Products
  - Reviews
  - Support
  - FAQ
  - Privacy
  - Language
- Product cards + details
- Promo flow:
  - enter code as dedicated step
  - validation (expiry, limits, product restrictions, only-new-user)
  - live recalculation before payment
- Payment entry point via abstract payment layer
- Order statuses and My Orders view
- Support ticket creation from bot
- `/clear` to reset state

### Admin panel

- Secure login
- Dashboard with KPIs, revenue graph, top products, promo conversion, latest audit
- Users section (block/unblock)
- Products section (create + enable/disable)
- Orders section (filters + status actions + auto issue)
- Promo codes section
- Reviews section
- FAQ section
- Tickets section (reply + close)
- Settings section
- Audit logs section

### API / backend

- RBAC roles: `superadmin`, `admin`, `support`
- Validation with `zod`
- Global rate limiting
- Security middleware (`helmet`, cookie handling)
- Payment abstraction:
  - `demo` provider (default)
  - `yookassa` provider (ready via env)
- Idempotency keys for orders/payments
- Protection against repeated token delivery
- Audit logs for admin actions

## Data model

Prisma schema includes:

- `User`
- `AdminUser`
- `ProductCategory`
- `Product`
- `Order`
- `Payment`
- `PromoCode`
- `PromoCodeUsage`
- `DeliveryItem`
- `OrderDelivery`
- `Review`
- `FAQItem`
- `SupportTicket`
- `SupportMessage`
- `Setting`
- `AuditLog`

## Quick start (local)

1. Copy env:

```bash
cp .env.example .env
```

2. Install dependencies:

```bash
npm install
```

3. Start PostgreSQL (docker or local) and run DB setup:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

4. Run services in separate terminals:

```bash
npm run dev:api
npm run dev:bot
npm run dev:admin
```

- API: `http://localhost:8080`
- Admin: `http://localhost:3000`

Seed admin account:

- email: `owner@gptishka.local`
- password: value of `ADMIN_SEED_PASSWORD` or default `ChangeMe_123456`

## Docker

```bash
docker compose up --build
```

## Notes for production

- Replace all secrets in `.env`
- Use managed PostgreSQL and backup policy
- Set `PAYMENT_PROVIDER=yookassa` and fill YooKassa credentials
- Put admin and API behind reverse proxy (TLS)
- Enable external logging/monitoring

## Planned extension points

- multi-payment routing
- referral and partner program
- multi-currency pricing
- segmented broadcast campaigns
- shared DB integration with existing site
