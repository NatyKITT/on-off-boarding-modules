import { NextRequest, NextResponse } from "next/server"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function monthRange(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0))
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0))
  return { from, to }
}

export async function GET(req: NextRequest) {
  try {
    const u = new URL(req.url)
    const year = Number(u.searchParams.get("year"))
    const month = Number(u.searchParams.get("month"))
    const include = (u.searchParams.get("include") ?? "both") as
      | "planned"
      | "actual"
      | "both"

    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      month < 1 ||
      month > 12
    ) {
      return NextResponse.json(
        { status: "error", message: "Neplatný rok/měsíc." },
        { status: 400 }
      )
    }

    const { from, to } = monthRange(year, month)

    const [onbPlanned, onbActual, offPlanned, offActual] = await Promise.all([
      include !== "actual"
        ? prisma.employeeOnboarding.findMany({
            where: {
              deletedAt: null,
              plannedStart: { gte: from, lt: to },
            },
            orderBy: { plannedStart: "asc" },
            select: {
              id: true,
              name: true,
              surname: true,
              positionName: true,
              department: true,
              unitName: true,
              plannedStart: true,
            },
          })
        : Promise.resolve([]),
      include !== "planned"
        ? prisma.employeeOnboarding.findMany({
            where: {
              deletedAt: null,
              actualStart: { gte: from, lt: to },
            },
            orderBy: { actualStart: "asc" },
            select: {
              id: true,
              name: true,
              surname: true,
              positionName: true,
              department: true,
              unitName: true,
              actualStart: true,
            },
          })
        : Promise.resolve([]),
      include !== "actual"
        ? prisma.employeeOffboarding.findMany({
            where: {
              deletedAt: null,
              plannedEnd: { gte: from, lt: to },
            },
            orderBy: { plannedEnd: "asc" },
            select: {
              id: true,
              name: true,
              surname: true,
              positionName: true,
              department: true,
              unitName: true,
              plannedEnd: true,
            },
          })
        : Promise.resolve([]),
      include !== "planned"
        ? prisma.employeeOffboarding.findMany({
            where: {
              deletedAt: null,
              actualEnd: { gte: from, lt: to },
            },
            orderBy: { actualEnd: "asc" },
            select: {
              id: true,
              name: true,
              surname: true,
              positionName: true,
              department: true,
              unitName: true,
              actualEnd: true,
            },
          })
        : Promise.resolve([]),
    ])

    // OPRAVENO: Používáme ActionType enum a kontrolujeme existující reporty
    const [sentOnb, sentOff, existingReports] = await Promise.all([
      prisma.onboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT", // ActionType enum hodnota
          field: "MONTHLY_SUMMARY",
        },
        select: { employeeId: true, newValue: true, createdAt: true },
      }),
      prisma.offboardingChangeLog.findMany({
        where: {
          action: "MAIL_SENT", // ActionType enum hodnota
          field: "MONTHLY_SUMMARY",
        },
        select: { employeeId: true, newValue: true, createdAt: true },
      }),
      // Také kontrolujeme MonthlyReport tabulku
      prisma.monthlyReport.findMany({
        where: {
          month: `${year}-${String(month).padStart(2, "0")}`,
        },
        select: { reportType: true, sentAt: true },
      }),
    ])

    const sentOnbIds = new Set(sentOnb.map((r) => r.employeeId))
    const sentOffIds = new Set(sentOff.map((r) => r.employeeId))

    // Kontrola zda už byl report pro tento měsíc odeslán
    const monthlyReportSent = existingReports.some((r) => r.sentAt !== null)

    return NextResponse.json({
      status: "success",
      data: {
        year,
        month,
        monthlyReportSent, // Nové pole
        planned: {
          onboardings: onbPlanned.map((r) => ({
            ...r,
            alreadySent: sentOnbIds.has(r.id),
          })),
          offboardings: offPlanned.map((r) => ({
            ...r,
            alreadySent: sentOffIds.has(r.id),
          })),
        },
        actual: {
          onboardings: onbActual.map((r) => ({
            ...r,
            alreadySent: sentOnbIds.has(r.id),
          })),
          offboardings: offActual.map((r) => ({
            ...r,
            alreadySent: sentOffIds.has(r.id),
          })),
        },
      },
    })
  } catch (e) {
    console.error("GET /api/reporty/mesicni/kandidati error:", e)
    return NextResponse.json(
      { status: "error", message: "Nelze načíst kandidáty." },
      { status: 500 }
    )
  }
}
