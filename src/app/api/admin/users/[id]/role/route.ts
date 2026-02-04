import { NextRequest, NextResponse } from "next/server"
import { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PROTECTED_EMAILS: ReadonlySet<string> = new Set(
  [
    process.env.SUPER_ADMIN_EMAILS ?? "",
    process.env.HR_EMAILS ?? "",
    process.env.IT_EMAILS ?? "",
    process.env.READONLY_EMAILS ?? "",
  ]
    .join(",")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser()

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const { role: newRole } = body

    if (!Object.values(Role).includes(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { email: true },
    })

    if (
      targetUser?.email &&
      PROTECTED_EMAILS.has(targetUser.email.toLowerCase())
    ) {
      return NextResponse.json(
        { error: "Cannot change role for protected email (defined in ENV)" },
        { status: 403 }
      )
    }

    const canAccessApp = newRole !== "USER"

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        role: newRole,
        canAccessApp,
      },
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error("Error updating user role:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
