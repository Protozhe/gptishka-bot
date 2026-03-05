import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../../lib/password";
import { unauthorized } from "../../lib/http-error";
import type { AdminRole } from "@prisma/client";
import jwt from "jsonwebtoken";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const REFRESH_COOKIE_NAME = "gptishka_refresh";

function signAccess(app: FastifyInstance, admin: { id: string; role: AdminRole; email: string }): string {
  return app.jwt.sign(
    { sub: admin.id, role: admin.role, email: admin.email, typ: "access" },
    { expiresIn: "20m" }
  );
}

function signRefresh(app: FastifyInstance, admin: { id: string; role: AdminRole; email: string }): string {
  return jwt.sign(
    { sub: admin.id, role: admin.role, email: admin.email, typ: "refresh" },
    app.ctx.env.JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

function setRefreshCookie(app: FastifyInstance, reply: any, refreshToken: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, refreshToken, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: app.ctx.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const admin = await app.ctx.prisma.adminUser.findUnique({ where: { email: body.email } });
    if (!admin || !admin.isActive) {
      throw unauthorized("Invalid credentials");
    }

    const valid = await verifyPassword(body.password, admin.passwordHash);
    if (!valid) {
      throw unauthorized("Invalid credentials");
    }

    await app.ctx.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() }
    });

    const tokenPayload = { id: admin.id, role: admin.role, email: admin.email };
    const accessToken = signAccess(app, tokenPayload);
    const refreshToken = signRefresh(app, tokenPayload);

    setRefreshCookie(app, reply, refreshToken);

    reply.send({
      accessToken,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  });

  app.post("/refresh", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE_NAME];
    if (!token) {
      throw unauthorized("No refresh token");
    }

    const payload = jwt.verify(token, app.ctx.env.JWT_REFRESH_SECRET) as {
      sub: string;
      role: AdminRole;
      email: string;
      typ: "refresh";
    };

    if (payload.typ !== "refresh") {
      throw unauthorized("Invalid token");
    }

    const admin = await app.ctx.prisma.adminUser.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive) {
      throw unauthorized("Invalid token");
    }

    const accessToken = signAccess(app, { id: admin.id, role: admin.role, email: admin.email });
    reply.send({ accessToken });
  });

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(REFRESH_COOKIE_NAME, { path: "/" });
    reply.send({ ok: true });
  });

  app.get("/me", { preHandler: app.requireAdmin() }, async (request) => {
    const admin = await app.ctx.prisma.adminUser.findUnique({ where: { id: request.adminUser!.id } });
    if (!admin) {
      throw unauthorized();
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    };
  });
}
