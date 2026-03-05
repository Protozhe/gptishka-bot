import "fastify";
import type { AppContext } from "../server";
import type { AdminRole } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
    requireAdmin: (roles?: AdminRole[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    adminUser?: {
      id: string;
      role: AdminRole;
      email: string;
    };
  }
}
