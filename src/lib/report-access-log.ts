import type { MailJobType, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function logReportAccess(args: {
  reportType: MailJobType
  by?: string | null
  byName?: string | null
  byEmail?: string | null
  message?: string | null
  meta?: Prisma.InputJsonValue
}) {
  await prisma.reportAccessLog.create({
    data: {
      reportType: args.reportType,
      by: args.by ?? null,
      byName: args.byName ?? null,
      byEmail: args.byEmail ?? null,
      message: args.message ?? null,
      meta: args.meta ?? undefined,
    },
  })
}
