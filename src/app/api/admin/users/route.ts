import { NextResponse } from "next/server"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: {
        email: {
          endsWith: "@praha6.cz",
        },
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        canAccessApp: true,
        personalNumber: true,
        createdAt: true,
      },
      orderBy: {
        email: "asc",
      },
    })

    return NextResponse.json({ users })
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
