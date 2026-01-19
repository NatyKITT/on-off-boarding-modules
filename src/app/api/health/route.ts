import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json({
      status: "ok",
      time: new Date().toISOString(),
      db: "ok",
    })
  } catch (error) {
    console.error("Health check DB error:", error)
    return NextResponse.json(
      {
        status: "error",
        time: new Date().toISOString(),
        db: "down",
      },
      { status: 500 }
    )
  }
}
