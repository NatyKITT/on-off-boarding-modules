import type { EmploymentDocumentEventAction, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function logEmploymentDocumentEvent(args: {
  documentId: number
  action: EmploymentDocumentEventAction
  by?: string | null
  byName?: string | null
  byEmail?: string | null
  message?: string | null
  meta?: Prisma.InputJsonValue
}) {
  await prisma.employmentDocumentEvent.create({
    data: {
      documentId: args.documentId,
      action: args.action,
      by: args.by ?? null,
      byName: args.byName ?? null,
      byEmail: args.byEmail ?? null,
      message: args.message ?? null,
      meta: args.meta ?? undefined,
    },
  })
}
