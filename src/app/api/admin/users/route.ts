import { NextRequest, NextResponse } from "next/server"

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

function getEnvRole(email: string): string | null {
  const lower = email.toLowerCase()
  const domain = lower.split("@")[1] ?? ""

  if (domain === "kitt6.cz") return "ADMIN"
  if (parseEnvEmails(process.env.SUPER_ADMIN_EMAILS).includes(lower))
    return "ADMIN"
  if (parseEnvEmails(process.env.HR_EMAILS).includes(lower)) return "HR"
  if (parseEnvEmails(process.env.IT_EMAILS).includes(lower)) return "IT"
  if (parseEnvEmails(process.env.READONLY_EMAILS).includes(lower))
    return "READONLY"

  return null
}

export async function GET() {
  try {
    const user = await getCurrentUser()

    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const users = await prisma.user.findMany({
      where: {
        email: { endsWith: "@praha6.cz" },
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
      orderBy: { email: "asc" },
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

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || currentUser.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = await req.json()
    const { email, role } = body as { email?: string; role?: string }

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email je povinný." }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (!normalizedEmail.endsWith("@praha6.cz")) {
      return NextResponse.json(
        { error: "Lze přidat pouze uživatele s emailem @praha6.cz." },
        { status: 400 }
      )
    }

    const envRole = getEnvRole(normalizedEmail)
    if (envRole !== null) {
      return NextResponse.json(
        {
          error: `Tento email má roli definovanou v ENV (${envRole}). Přidá se automaticky při prvním přihlášení.`,
        },
        { status: 409 }
      )
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existing) {
      return NextResponse.json(
        { error: "Uživatel s tímto emailem je již registrován." },
        { status: 409 }
      )
    }

    const allowedRoles = ["USER", "READONLY", "HR", "IT", "ADMIN"]
    const assignedRole = allowedRoles.includes(role ?? "") ? role! : "USER"

    const newUser = await prisma.user.create({
      data: {
        email: normalizedEmail,
        role: assignedRole as "USER" | "READONLY" | "HR" | "IT" | "ADMIN",
        canAccessApp: assignedRole !== "USER",
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

    return NextResponse.json({ user: newUser }, { status: 201 })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
