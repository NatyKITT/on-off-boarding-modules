import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const kind = url.searchParams.get("kind")
    if (kind !== "onboarding" && kind !== "offboarding") {
      return NextResponse.json(
        { status: "error", message: "Neplatný parametr kind." },
        { status: 400 }
      )
    }

    const rows =
      kind === "onboarding"
        ? await prisma.onboardingChangeLog.findMany({
            where: { action: "DELETE" },
            orderBy: { createdAt: "desc" },
            select: { id: true, userId: true, createdAt: true, oldValue: true },
            take: 100,
          })
        : await prisma.offboardingChangeLog.findMany({
            where: { action: "DELETE" },
            orderBy: { createdAt: "desc" },
            select: { id: true, userId: true, createdAt: true, oldValue: true },
            take: 100,
          })

    const userKeys = Array.from(
      new Set(rows.map((r) => r.userId).filter(Boolean))
    )
    const users = userKeys.length
      ? await prisma.user.findMany({
          where: {
            OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }],
          },
          select: { id: true, email: true, name: true, surname: true },
        })
      : []
    const nameByKey = new Map<string, string>()
    for (const u of users) {
      const label =
        [u.name, u.surname].filter(Boolean).join(" ") || u.email || u.id
      if (u.id) nameByKey.set(u.id, label)
      if (u.email) nameByKey.set(u.email, label)
    }

    const data = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      displayUser: nameByKey.get(r.userId) ?? r.userId ?? "unknown",
      createdAt: r.createdAt.toISOString(),
      oldValue: r.oldValue ?? null,
    }))

    return NextResponse.json({ status: "success", data })
  } catch (err) {
    console.error("GET /api/audit/deleted error:", err)
    return NextResponse.json(
      { status: "error", message: "Nelze načíst smazané záznamy." },
      { status: 500 }
    )
  }
}
