import type { UserAuditAction } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function logUserAudit(args: {
  targetUserId?: string | null
  targetEmail: string
  action: UserAuditAction
  oldValue?: string | null
  newValue?: string | null
  by?: string | null
  byName?: string | null
  byEmail?: string | null
}) {
  await prisma.userAuditLog.create({
    data: {
      targetUserId: args.targetUserId ?? null,
      targetEmail: args.targetEmail,
      action: args.action,
      oldValue: args.oldValue ?? null,
      newValue: args.newValue ?? null,
      by: args.by ?? null,
      byName: args.byName ?? null,
      byEmail: args.byEmail ?? null,
    },
  })
}
