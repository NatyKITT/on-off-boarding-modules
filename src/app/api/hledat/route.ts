import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canReadOffboarding, canReadOnboarding } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const RESULTS_PER_MODULE = 8
const MIN_QUERY_LENGTH = 2

type SearchModule = "nastup" | "odchod" | "zmena"

type SearchResult = {
  id: number
  module: SearchModule
  label: string
  sublabel: string
  href: string
}

function buildFullName(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim()
}

function buildSublabel(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" · ")
}

// Rozdělí dotaz na jednotlivá klíčová slova - každé slovo musí sedět
// NĚKDE (jméno, příjmení, pozice, odbor...), ale klidně v jiném poli než
// ostatní slova. Díky tomu najde "Jan Novák" i když appka drží jméno a
// příjmení ve dvou samostatných sloupcích.
function splitKeywords(q: string): string[] {
  return q
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const role = session.user.role
  const q = (request.nextUrl.searchParams.get("q") || "").trim()

  if (q.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ status: "success", data: [] })
  }

  const keywords = splitKeywords(q)

  try {
    const [onboardings, offboardings, changes] = await Promise.all([
      canReadOnboarding(role)
        ? prisma.employeeOnboarding.findMany({
            where: {
              deletedAt: null,
              AND: keywords.map((word) => ({
                OR: [
                  { name: { contains: word } },
                  { surname: { contains: word } },
                  { titleBefore: { contains: word } },
                  { titleAfter: { contains: word } },
                  { positionName: { contains: word } },
                  { department: { contains: word } },
                  { unitName: { contains: word } },
                  { personalNumber: { contains: word } },
                ],
              })),
            },
            select: {
              id: true,
              name: true,
              surname: true,
              titleBefore: true,
              titleAfter: true,
              positionName: true,
              department: true,
              unitName: true,
              personalNumber: true,
              plannedStart: true,
              actualStart: true,
              cancelledAt: true,
            },
            take: RESULTS_PER_MODULE,
          })
        : Promise.resolve([]),

      canReadOffboarding(role)
        ? prisma.employeeOffboarding.findMany({
            where: {
              deletedAt: null,
              AND: keywords.map((word) => ({
                OR: [
                  { name: { contains: word } },
                  { surname: { contains: word } },
                  { titleBefore: { contains: word } },
                  { titleAfter: { contains: word } },
                  { positionName: { contains: word } },
                  { department: { contains: word } },
                  { unitName: { contains: word } },
                  { personalNumber: { contains: word } },
                ],
              })),
            },
            select: {
              id: true,
              name: true,
              surname: true,
              titleBefore: true,
              titleAfter: true,
              positionName: true,
              department: true,
              unitName: true,
              personalNumber: true,
              plannedEnd: true,
              actualEnd: true,
            },
            take: RESULTS_PER_MODULE,
          })
        : Promise.resolve([]),

      prisma.employeeChange.findMany({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          AND: keywords.map((word) => ({
            OR: [
              { name: { contains: word } },
              { surname: { contains: word } },
              { titleBefore: { contains: word } },
              { titleAfter: { contains: word } },
              { oldPositionName: { contains: word } },
              { newPositionName: { contains: word } },
              { oldDepartment: { contains: word } },
              { newDepartment: { contains: word } },
              { oldUnitName: { contains: word } },
              { newUnitName: { contains: word } },
              { personalNumber: { contains: word } },
            ],
          })),
        },
        select: {
          id: true,
          name: true,
          surname: true,
          titleBefore: true,
          titleAfter: true,
          oldPositionName: true,
          newPositionName: true,
          oldDepartment: true,
          newDepartment: true,
          oldUnitName: true,
          newUnitName: true,
          personalNumber: true,
        },
        take: RESULTS_PER_MODULE,
      }),
    ])

    const results: SearchResult[] = [
      ...onboardings.map((row): SearchResult => {
        const status = row.cancelledAt
          ? "cancelled"
          : row.actualStart
            ? "actual"
            : "planned"

        return {
          id: row.id,
          module: "nastup",
          label: buildFullName([
            row.titleBefore,
            row.name,
            row.surname,
            row.titleAfter,
          ]),
          sublabel: buildSublabel([
            row.personalNumber ? `č. ${row.personalNumber}` : null,
            row.positionName,
            row.department,
            row.unitName,
          ]),
          href: `/nastupy?highlight=${row.id}&status=${status}`,
        }
      }),

      ...offboardings.map((row): SearchResult => {
        const status = row.actualEnd ? "actual" : "planned"

        return {
          id: row.id,
          module: "odchod",
          label: buildFullName([
            row.titleBefore,
            row.name,
            row.surname,
            row.titleAfter,
          ]),
          sublabel: buildSublabel([
            row.personalNumber ? `č. ${row.personalNumber}` : null,
            row.positionName,
            row.department,
            row.unitName,
          ]),
          href: `/odchody?highlight=${row.id}&status=${status}`,
        }
      }),

      ...changes.map((row): SearchResult => {
        return {
          id: row.id,
          module: "zmena",
          label: buildFullName([
            row.titleBefore,
            row.name,
            row.surname,
            row.titleAfter,
          ]),
          sublabel: buildSublabel([
            row.personalNumber ? `č. ${row.personalNumber}` : null,
            row.newPositionName || row.oldPositionName,
            row.newDepartment || row.oldDepartment,
            row.newUnitName || row.oldUnitName,
          ]),
          href: `/zmeny?highlight=${row.id}`,
        }
      }),
    ]

    return NextResponse.json({ status: "success", data: results })
  } catch (error) {
    console.error("GET /api/hledat error:", error)

    return NextResponse.json(
      { status: "error", message: "Vyhledávání selhalo." },
      { status: 500 }
    )
  }
}
