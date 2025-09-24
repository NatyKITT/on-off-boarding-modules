import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const kind =
    (url.searchParams.get("kind") as "onboarding" | "offboarding") ??
    "onboarding"
  const id = Number(url.searchParams.get("id"))
  if (
    !Number.isFinite(id) ||
    (kind !== "onboarding" && kind !== "offboarding")
  ) {
    return NextResponse.json(
      { status: "error", message: "Neplatný dotaz (kind/id)." },
      { status: 400 }
    )
  }

  const rows =
    kind === "onboarding"
      ? await prisma.onboardingChangeLog.findMany({
          where: { employeeId: id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            employeeId: true,
            userId: true,
            action: true,
            field: true,
            oldValue: true,
            newValue: true,
            createdAt: true,
          },
        })
      : await prisma.offboardingChangeLog.findMany({
          where: { employeeId: id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            employeeId: true,
            userId: true,
            action: true,
            field: true,
            oldValue: true,
            newValue: true,
            createdAt: true,
          },
        })

  const userKeys = Array.from(
    new Set(rows.map((r) => r.userId).filter(Boolean))
  )
  const users = await prisma.user.findMany({
    where: { OR: [{ id: { in: userKeys } }, { email: { in: userKeys } }] },
    select: { id: true, email: true, name: true, surname: true },
  })
  const nameByKey = new Map<string, string>()
  for (const u of users) {
    const label =
      [u.name, u.surname].filter(Boolean).join(" ") || u.email || u.id
    if (u.id) nameByKey.set(u.id, label)
    if (u.email) nameByKey.set(u.email, label)
  }

  const data = rows.map((r) => ({
    ...r,
    displayUser: nameByKey.get(r.userId) ?? r.userId ?? "unknown",
  }))
  return NextResponse.json({ status: "success", data })
}
