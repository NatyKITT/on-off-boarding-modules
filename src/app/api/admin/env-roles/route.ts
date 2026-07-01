import { NextResponse } from "next/server"
import { Role } from "@prisma/client"

import { canManageUsers } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ManagedRole = Extract<Role, "ADMIN" | "HR" | "IT" | "READONLY">

function parseEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

export async function GET() {
  const currentUser = await getCurrentUser()

  if (!currentUser || !canManageUsers(currentUser.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  const superAdmins = parseEmails(process.env.SUPER_ADMIN_EMAILS)
  const hrEmails = parseEmails(process.env.HR_EMAILS)
  const itEmails = parseEmails(process.env.IT_EMAILS)
  const readonlyEmails = parseEmails(process.env.READONLY_EMAILS)

  const roleMap = new Map<string, ManagedRole>()

  readonlyEmails.forEach((email) => {
    if (!roleMap.has(email)) roleMap.set(email, Role.READONLY)
  })

  itEmails.forEach((email) => {
    if (!roleMap.has(email)) roleMap.set(email, Role.IT)
  })

  hrEmails.forEach((email) => {
    if (!roleMap.has(email)) roleMap.set(email, Role.HR)
  })

  superAdmins.forEach((email) => {
    roleMap.set(email, Role.ADMIN)
  })

  const entries = Array.from(roleMap.entries())
    .map(([email, role]) => ({
      email,
      role,
      canAccessApp: true,
      source: "ENV" as const,
    }))
    .sort((a, b) => a.email.localeCompare(b.email, "cs"))

  return NextResponse.json({ envUsers: entries })
}
