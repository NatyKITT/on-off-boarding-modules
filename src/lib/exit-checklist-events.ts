import type { ExitChecklistEventAction, Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function logExitChecklistEvent(args: {
  checklistId: number
  action: ExitChecklistEventAction
  by?: string | null
  byName?: string | null
  byEmail?: string | null
  message?: string | null
  meta?: Prisma.InputJsonValue
}) {
  await prisma.exitChecklistEvent.create({
    data: {
      checklistId: args.checklistId,
      action: args.action,
      by: args.by ?? null,
      byName: args.byName ?? null,
      byEmail: args.byEmail ?? null,
      message: args.message ?? null,
      meta: args.meta ?? undefined,
    },
  })
}
