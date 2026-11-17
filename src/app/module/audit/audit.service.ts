import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { parsePagination } from "../../utils/pagination";

type TLogActionPayload = {
  userId: string | null;
  action: string;
  entityName: string;
  entityId: string;
  oldValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
  newValue?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

const logAction = async (payload: TLogActionPayload) => {
  try {
    await prisma.auditLog.create({ data: payload });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
};

const getAuditLogs = async (query: {
  page?: string;
  limit?: string;
  entityName?: string;
}) => {
  const { page, limit, skip } = parsePagination(query, 20);
  const where = { ...(query.entityName && { entityName: query.entityName }) };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    data: logs,
  };
};

export const AuditService = { logAction, getAuditLogs };
