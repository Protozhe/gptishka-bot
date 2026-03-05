import type { FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";

export async function writeAudit(
  prisma: PrismaClient,
  request: FastifyRequest,
  params: {
    adminUserId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    payload?: unknown;
  }
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      adminUserId: params.adminUserId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      payload: params.payload as any,
      ip: request.ip,
      userAgent: request.headers["user-agent"]
    }
  });
}
