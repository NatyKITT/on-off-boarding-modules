// src/lib/notifications.ts
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { prisma } from "@/lib/db"

export type PlannedType = "IT" | "FACILITY" | "HR" | "TRAINING" | "CANDIDATE"

export function recipientsForPlanned(type: PlannedType): string[] {
  switch (type) {
    case "IT":
      return (process.env.MAIL_IT ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    case "FACILITY":
      return (process.env.MAIL_FACILITY ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    case "HR":
      return (process.env.MAIL_HR ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    case "TRAINING":
      return (process.env.MAIL_TRAINING ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    case "CANDIDATE":
      return []
  }
}

export function recipientsForAll(): string[] {
  return (process.env.MAIL_ALL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function fetchPlannedRows(ids: number[]) {
  const employees = await prisma.employeeOnboarding.findMany({
    where: { id: { in: ids } },
  })
  const rows = employees.map((e) => ({
    Jméno:
      `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`.trim(),
    Pozice: e.positionName,
    "Odbor / Oddělení": `${e.department} / ${e.unitName}`,
    "Plánovaný nástup": format(new Date(e.plannedStart), "d.M.yyyy", {
      locale: cs,
    }),
    Email: e.email,
  }))
  return { employees, rows }
}

export async function fetchActualRows(ids: number[]) {
  const employees = await prisma.employeeOnboarding.findMany({
    where: { id: { in: ids } },
  })
  const rows = employees.map((e) => ({
    Jméno:
      `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`.trim(),
    Pozice: e.positionName,
    "Odbor / Oddělení": `${e.department} / ${e.unitName}`,
    "Skutečný nástup": e.actualStart
      ? format(new Date(e.actualStart), "d.M.yyyy", { locale: cs })
      : "—",
  }))
  return { employees, rows }
}
