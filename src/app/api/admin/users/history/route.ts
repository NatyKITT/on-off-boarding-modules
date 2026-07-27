import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { canManageUsers } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser || !canManageUsers(currentUser.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const rows = await prisma.userAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  return NextResponse.json({
    status: "success",
    data: rows.map((row) => ({
      id: row.id,
      action: row.action,
      by: row.byName || row.byEmail || row.by || null,
      message: [
        row.targetEmail,
        row.oldValue && row.newValue
          ? `${row.oldValue} → ${row.newValue}`
          : row.newValue || null,
      ]
        .filter(Boolean)
        .join(" — "),
      createdAt: row.createdAt.toISOString(),
    })),
  })
}
