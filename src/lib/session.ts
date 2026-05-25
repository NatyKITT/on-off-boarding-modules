


import "server-only"

import { redirect } from "next/navigation"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"

import { canAccessInternalApp, canEditInternalApp } from "@/lib/rbac"





export const getSession = auth

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? undefined
}

export async function requireUser() {
  const session = await auth()

  if (!session?.user) {
    redirect("/signin")
  }

  return session.user
}

export async function requireRole(roles: Role[] | Role) {
  const user = await requireUser()
  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  if (!user.role || !allowedRoles.includes(user.role)) {
    redirect("/no-access")
  }

  return user
}

export async function requireInternalUser() {
  const user = await requireUser()

  if (!canAccessInternalApp(user.role)) {
    redirect("/no-access")
  }

  return user
}

export async function requireInternalEditor() {
  const user = await requireUser()

  if (!canEditInternalApp(user.role)) {
    redirect("/no-access")
  }

  return user
}

export async function requireAdmin() {
  const user = await requireUser()

  if (user.role !== "ADMIN") {
    redirect("/no-access")
  }

  return user
}
