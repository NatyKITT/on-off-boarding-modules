import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"

type Body = { ids?: string[] }

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body
    const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : []
    if (!ids.length) return NextResponse.json({ status: "success", data: {} })

    const users = await prisma.user.findMany({
      where: { OR: [{ id: { in: ids } }, { email: { in: ids } }] },
      select: { id: true, name: true, surname: true, email: true },
    })

    const map: Record<string, string> = {}
    for (const u of users) {
      const display =
        [u.name, u.surname].filter(Boolean).join(" ").trim() || u.email || u.id
      map[u.id] = display
      if (u.email && ids.includes(u.email)) map[u.email] = display
    }
    for (const k of ids) if (!map[k]) map[k] = k

    return NextResponse.json({ status: "success", data: map })
  } catch (e) {
    console.error("POST /api/uzivatel/vyresit error:", e)
    return NextResponse.json(
      { status: "error", message: "Nelze rozlišit uživatele." },
      { status: 500 }
    )
  }
}
