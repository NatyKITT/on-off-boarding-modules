import { NextRequest, NextResponse } from "next/server"
import { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function parseEnvEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
}

const getProtectedEmails = (): ReadonlySet<string> =>
  new Set([
    ...parseEnvEmails(process.env.SUPER_ADMIN_EMAILS),
    ...parseEnvEmails(process.env.HR_EMAILS),
    ...parseEnvEmails(process.env.IT_EMAILS),
    ...parseEnvEmails(process.env.READONLY_EMAILS),
  ])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const { role: newRole } = body

    if (!newRole || !Object.values(Role).includes(newRole)) {
      return NextResponse.json({ error: "Neplatná role." }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { email: true },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "Uživatel nebyl nalezen." },
        { status: 404 }
      )
    }

    const protectedEmails = getProtectedEmails()
    if (protectedEmails.has(targetUser.email.toLowerCase())) {
      return NextResponse.json(
        {
          error:
            "Role tohoto uživatele je definována v ENV a nelze ji změnit přes toto rozhraní.",
        },
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
      select: {
        id: true,
        email: true,
        role: true,
        canAccessApp: true,
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error("Error updating user role:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
