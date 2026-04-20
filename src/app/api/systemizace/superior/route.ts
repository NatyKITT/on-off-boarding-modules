import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { resolveSupervisorFromPositionNum } from "@/lib/systemizace-superior"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function toSupervisorResponse(input: {
  gid?: string | null
  titleBefore?: string | null
  name?: string | null
  surname?: string | null
  titleAfter?: string | null
  email?: string | null
  position?: string | null
  department?: string | null
  unitName?: string | null
  personalNumber?: string | null
}) {
  const fullName = [
    input.titleBefore,
    input.name,
    input.surname,
    input.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return {
    gid: input.gid ?? null,
    titleBefore: input.titleBefore ?? null,
    name: input.name ?? null,
    surname: input.surname ?? null,
    titleAfter: input.titleAfter ?? null,
    fullName: fullName || null,
    email: input.email ?? null,
    position: input.position ?? null,
    department: input.department ?? null,
    unitName: input.unitName ?? null,
    personalNumber: input.personalNumber ?? null,
  }
}

export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const positionNum = req.nextUrl.searchParams.get("positionNum")?.trim()

  if (!positionNum) {
    return NextResponse.json(
      { message: "Missing positionNum" },
      { status: 400 }
    )
  }

  try {
    const result = await resolveSupervisorFromPositionNum(positionNum)

    if (!result?.snapshot) {
      return NextResponse.json(
        { message: "Supervisor not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      supervisor: toSupervisorResponse({
        gid: result.snapshot.gid,
        titleBefore: result.snapshot.titleBefore,
        name: result.snapshot.name,
        surname: result.snapshot.surname,
        titleAfter: result.snapshot.titleAfter,
        email: result.snapshot.email,
        position: result.snapshot.position,
        department: result.snapshot.department,
        unitName: result.snapshot.unitName,
        personalNumber: result.snapshot.personalNumber,
      }),
      source: "position",
    })
  } catch (error) {
    console.error("Supervisor lookup error:", error)
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    )
  }
}
