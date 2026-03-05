import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminRole } from "@prisma/client";
import { forbidden, unauthorized } from "../lib/http-error";

interface JwtPayload {
  sub: string;
  role: AdminRole;
  email: string;
  typ: "access" | "refresh";
}

export function attachAuthGuards(app: FastifyInstance): void {
  app.decorate("requireAdmin", (roles?: AdminRole[]) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      const token = request.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        throw unauthorized();
      }

      const payload = (await request.jwtVerify<JwtPayload>({ onlyCookie: false })) as JwtPayload;
      if (payload.typ !== "access") {
        throw unauthorized();
      }

      request.adminUser = {
        id: payload.sub,
        role: payload.role,
        email: payload.email
      };

      if (roles && roles.length > 0 && !roles.includes(payload.role)) {
        throw forbidden();
      }
    };
  });
}
