import type { Role } from "@prisma/client"

export type Permission =
  | "ADMIN_ACCESS"
  | "USERS_MANAGE"
  | "ONBOARDING_READ"
  | "ONBOARDING_WRITE"
  | "OFFBOARDING_READ"
  | "OFFBOARDING_WRITE"
  | "EXIT_CHECKLIST_READ"
  | "EXIT_CHECKLIST_SIGN"
  | "EXIT_CHECKLIST_ADMIN"

const ROLE_PERMS: Record<Role, Permission[]> = {
  ADMIN: [
    "ADMIN_ACCESS",
    "USERS_MANAGE",
    "ONBOARDING_READ",
    "ONBOARDING_WRITE",
    "OFFBOARDING_READ",
    "OFFBOARDING_WRITE",
    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],
  HR: [
    "ONBOARDING_READ",
    "ONBOARDING_WRITE",
    "OFFBOARDING_READ",
    "OFFBOARDING_WRITE",
    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],
  IT: [
    "ONBOARDING_READ",
    "ONBOARDING_WRITE",
    "OFFBOARDING_READ",
    "OFFBOARDING_WRITE",
    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],
  READONLY: [
    "ONBOARDING_READ",
    "OFFBOARDING_READ",
    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
  ],
  USER: ["EXIT_CHECKLIST_READ", "EXIT_CHECKLIST_SIGN"],
}

export function hasPerm(role: Role | null | undefined, perm: Permission) {
  if (!role) return false
  return ROLE_PERMS[role]?.includes(perm) ?? false
}

export function canAccessInternalApp(role: Role | null | undefined) {
  return (
    role === "ADMIN" || role === "HR" || role === "IT" || role === "READONLY"
  )
}

export function canEditInternalApp(role: Role | null | undefined) {
  return role === "ADMIN" || role === "HR" || role === "IT"
}

export function canAdminExitChecklist(role: Role | null | undefined) {
  return role === "ADMIN" || role === "HR" || role === "IT"
}
