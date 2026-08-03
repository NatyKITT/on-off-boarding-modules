import type { Role } from "@prisma/client"

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrátor",
  HR: "HR/PO",
  IT: "IT",
  READONLY: "Pouze čtení",
  USER: "Uživatel",
}

export function roleLabel(role: Role | null | undefined) {
  return role ? ROLE_LABELS[role] : "neznámá role"
}

export type Permission =
  | "ADMIN_ACCESS"
  | "USERS_MANAGE"
  | "ONBOARDING_READ"
  | "ONBOARDING_WRITE"
  | "OFFBOARDING_READ"
  | "OFFBOARDING_WRITE"
  | "MONTHLY_REPORT_READ"
  | "MONTHLY_REPORT_SEND"
  | "EMPLOYEE_CHANGE_READ"
  | "EMPLOYEE_CHANGE_WRITE"
  | "EMPLOYMENT_DOCUMENT_READ"
  | "EMPLOYMENT_DOCUMENT_MANAGE"
  | "EMPLOYMENT_DOCUMENT_SEND"
  | "PROBATION_EVALUATION_READ"
  | "PROBATION_EVALUATION_MANAGE"
  | "PROBATION_EVALUATION_SEND"
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

    "MONTHLY_REPORT_READ",
    "MONTHLY_REPORT_SEND",

    "EMPLOYEE_CHANGE_READ",
    "EMPLOYEE_CHANGE_WRITE",

    "EMPLOYMENT_DOCUMENT_READ",
    "EMPLOYMENT_DOCUMENT_MANAGE",
    "EMPLOYMENT_DOCUMENT_SEND",

    "PROBATION_EVALUATION_READ",
    "PROBATION_EVALUATION_MANAGE",
    "PROBATION_EVALUATION_SEND",

    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],

  HR: [
    "ONBOARDING_READ",
    "ONBOARDING_WRITE",

    "OFFBOARDING_READ",
    "OFFBOARDING_WRITE",

    "MONTHLY_REPORT_READ",
    "MONTHLY_REPORT_SEND",

    "EMPLOYEE_CHANGE_READ",
    "EMPLOYEE_CHANGE_WRITE",

    "EMPLOYMENT_DOCUMENT_READ",
    "EMPLOYMENT_DOCUMENT_MANAGE",
    "EMPLOYMENT_DOCUMENT_SEND",

    "PROBATION_EVALUATION_READ",
    "PROBATION_EVALUATION_MANAGE",
    "PROBATION_EVALUATION_SEND",

    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],

  IT: [
    "ONBOARDING_READ",
    "ONBOARDING_WRITE",

    "OFFBOARDING_READ",
    "OFFBOARDING_WRITE",

    "MONTHLY_REPORT_READ",
    "MONTHLY_REPORT_SEND",

    "EMPLOYEE_CHANGE_READ",
    "EMPLOYEE_CHANGE_WRITE",

    "EMPLOYMENT_DOCUMENT_READ",
    "EMPLOYMENT_DOCUMENT_SEND",

    "PROBATION_EVALUATION_READ",
    "PROBATION_EVALUATION_MANAGE",
    "PROBATION_EVALUATION_SEND",

    "EXIT_CHECKLIST_READ",
    "EXIT_CHECKLIST_SIGN",
    "EXIT_CHECKLIST_ADMIN",
  ],

  READONLY: [
    "ONBOARDING_READ",
    "OFFBOARDING_READ",
    "EMPLOYEE_CHANGE_READ",

    "MONTHLY_REPORT_READ",

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

export function canReadInternalApp(role: Role | null | undefined) {
  return canAccessInternalApp(role)
}

export function canEditInternalApp(role: Role | null | undefined) {
  return role === "ADMIN" || role === "HR" || role === "IT"
}

export function canManageUsers(role: Role | null | undefined) {
  return hasPerm(role, "USERS_MANAGE")
}

export function canReadOnboarding(role: Role | null | undefined) {
  return hasPerm(role, "ONBOARDING_READ")
}

export function canWriteOnboarding(role: Role | null | undefined) {
  return hasPerm(role, "ONBOARDING_WRITE")
}

export function canReadOffboarding(role: Role | null | undefined) {
  return hasPerm(role, "OFFBOARDING_READ")
}

export function canWriteOffboarding(role: Role | null | undefined) {
  return hasPerm(role, "OFFBOARDING_WRITE")
}

export function canReadEmployeeChanges(role: Role | null | undefined) {
  return hasPerm(role, "EMPLOYEE_CHANGE_READ")
}

export function canWriteEmployeeChanges(role: Role | null | undefined) {
  return hasPerm(role, "EMPLOYEE_CHANGE_WRITE")
}

export function canReadEmploymentDocuments(role: Role | null | undefined) {
  return hasPerm(role, "EMPLOYMENT_DOCUMENT_READ")
}

export function canManageEmploymentDocuments(role: Role | null | undefined) {
  return hasPerm(role, "EMPLOYMENT_DOCUMENT_MANAGE")
}

export function canSendEmploymentDocuments(role: Role | null | undefined) {
  return hasPerm(role, "EMPLOYMENT_DOCUMENT_SEND")
}

export function canReadProbationEvaluation(role: Role | null | undefined) {
  return hasPerm(role, "PROBATION_EVALUATION_READ")
}

export function canManageProbationEvaluation(role: Role | null | undefined) {
  return hasPerm(role, "PROBATION_EVALUATION_MANAGE")
}

export function canSendProbationEvaluation(role: Role | null | undefined) {
  return hasPerm(role, "PROBATION_EVALUATION_SEND")
}

export function canReadExitChecklist(role: Role | null | undefined) {
  return hasPerm(role, "EXIT_CHECKLIST_READ")
}

export function canSignExitChecklist(role: Role | null | undefined) {
  return hasPerm(role, "EXIT_CHECKLIST_SIGN")
}

export function canAdminExitChecklist(role: Role | null | undefined) {
  return hasPerm(role, "EXIT_CHECKLIST_ADMIN")
}

export function isReadonlyRole(role: Role | null | undefined) {
  return role === "READONLY"
}

export function canReadMonthlyReports(role: Role | null | undefined) {
  return hasPerm(role, "MONTHLY_REPORT_READ")
}

export function canSendMonthlyReports(role: Role | null | undefined) {
  return hasPerm(role, "MONTHLY_REPORT_SEND")
}
