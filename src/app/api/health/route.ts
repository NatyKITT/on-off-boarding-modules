import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const checkedAt = new Date().toISOString()

  try {
    await prisma.$queryRaw`SELECT 1`

    return NextResponse.json(
      {
        status: "ok",
        app: "ok",
        db: "ok",
        checkedAt,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error("Health check DB error:", error)

    return NextResponse.json(
      {
        status: "error",
        app: "ok",
        db: "down",
        checkedAt,
      },
      { status: 500 }
    )
  }
}
