import { NextRequest, NextResponse } from "next/server"
import { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { canManageUsers } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/session"
import { logUserAudit } from "@/lib/user-audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALLOWED_USER_EMAIL_DOMAINS = ["praha6.cz", "kitt6.cz"] as const

function parseEnvEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function getEnvRole(email: string): Role | null {
  const lower = email.toLowerCase()

  if (parseEnvEmails(process.env.SUPER_ADMIN_EMAILS).includes(lower)) {
    return Role.ADMIN
  }

  if (parseEnvEmails(process.env.HR_EMAILS).includes(lower)) return Role.HR
  if (parseEnvEmails(process.env.IT_EMAILS).includes(lower)) return Role.IT

  if (parseEnvEmails(process.env.READONLY_EMAILS).includes(lower)) {
    return Role.READONLY
  }

  return null
}

function isValidRole(value: unknown): value is Role {
  return (
    typeof value === "string" && Object.values(Role).includes(value as Role)
  )
}

function isAllowedEmail(email: string) {
  return ALLOWED_USER_EMAIL_DOMAINS.some((domain) =>
    email.endsWith(`@${domain}`)
  )
}

export async function GET() {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || !canManageUsers(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: {
        OR: ALLOWED_USER_EMAIL_DOMAINS.map((domain) => ({
          email: {
            endsWith: `@${domain}`,
          },
        })),
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        canAccessApp: true,
        createdAt: true,
        _count: { select: { accounts: true } },
      },
      orderBy: { email: "asc" },
    })

    return NextResponse.json({
      users: users.map(({ _count, ...user }) => ({
        ...user,
        hasSignedIn: _count.accounts > 0,
      })),
    })
  } catch (error) {
    console.error("Error fetching users:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || !canManageUsers(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as {
      email?: unknown
      role?: unknown
      name?: unknown
      surname?: unknown
    } | null

    const email = body?.email
    const requestedRole = body?.role
    const name =
      typeof body?.name === "string" && body.name.trim()
        ? body.name.trim()
        : null
    const surname =
      typeof body?.surname === "string" && body.surname.trim()
        ? body.surname.trim()
        : null

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email je povinný." }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail.includes("@")) {
      return NextResponse.json(
        { error: "Zadejte platný e-mail." },
        { status: 400 }
      )
    }

    if (!isAllowedEmail(normalizedEmail)) {
      return NextResponse.json(
        {
          error: `Lze přidat pouze uživatele s e-mailem ${ALLOWED_USER_EMAIL_DOMAINS.map(
            (domain) => `@${domain}`
          ).join(" nebo ")}.`,
        },
        { status: 400 }
      )
    }

    if (requestedRole !== undefined && !isValidRole(requestedRole)) {
      return NextResponse.json({ error: "Neplatná role." }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        role: true,
        canAccessApp: true,
      },
    })

    if (existing) {
      return NextResponse.json(
        {
          error:
            "Uživatel s tímto e-mailem už existuje. Roli změňte přes seznam uživatelů.",
          user: existing,
        },
        { status: 409 }
      )
    }

    const envRole = getEnvRole(normalizedEmail)
    const finalRole = envRole ?? requestedRole ?? Role.USER
    const canAccessApp = finalRole !== Role.USER

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        role: finalRole,
        canAccessApp,
        name,
        surname,
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        canAccessApp: true,
        createdAt: true,
      },
    })

    await logUserAudit({
      targetUserId: newUser.id,
      targetEmail: newUser.email,
      action: "CREATED",
      newValue: finalRole,
      by: currentUser.id ?? null,
      byName: currentUser.name ?? currentUser.email ?? null,
      byEmail: currentUser.email ?? null,
    })

    return NextResponse.json(
      {
        user: newUser,
        roleSource: envRole ? "ENV" : "ADMIN",
        message: envRole
          ? `Uživatel byl vytvořen s rolí ${envRole}, protože je definovaný v ENV.`
          : "Uživatel byl vytvořen.",
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error creating user:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
