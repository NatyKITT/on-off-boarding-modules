import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const jobs = await prisma.mailQueue.findMany({
      where: { type: "MONTHLY_SUMMARY" },
      select: { payload: true },
      orderBy: { createdAt: "asc" },
      take: 1000,
    })

    const out = new Set<string>()
    for (const j of jobs) {
      const p = j.payload as unknown as { year?: number; month?: number }
      if (typeof p?.year === "number" && typeof p?.month === "number") {
        out.add(`${p.year}-${String(p.month).padStart(2, "0")}`)
      }
    }

    return NextResponse.json({
      status: "success",
      data: Array.from(out).sort(),
    })
  } catch (e) {
    console.error("GET /api/reporty/mesicni/odeslano error:", e)
    return NextResponse.json(
      { status: "error", message: "Nelze načíst odeslané měsíce." },
      { status: 500 }
    )
  }
}
