import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { Prisma } from "@prisma/client"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { canAccessInternalApp, canEditInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  metric: z.string().trim().min(1),
  dimension: z.string().trim().min(1),
  displayType: z.string().trim().min(1),
  filters: z.record(z.unknown()),
})

export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canAccessInternalApp(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění zobrazit statistiky." },
      { status: 403 }
    )
  }

  try {
    const views = await prisma.statisticsSavedView.findMany({
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ status: "success", data: views })
  } catch (error) {
    console.error("GET /api/statistiky/views error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se načíst uložené pohledy." },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canEditInternalApp(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění ukládat pohledy." },
      { status: 403 }
    )
  }

  try {
    const body = createSchema.parse(await request.json())
    const createdBy = session.user.id ?? session.user.email ?? "unknown"

    const view = await prisma.statisticsSavedView.create({
      data: {
        name: body.name,
        metric: body.metric,
        dimension: body.dimension,
        displayType: body.displayType,
        filters: body.filters as Prisma.InputJsonValue,
        createdBy,
      },
    })

    return NextResponse.json({ status: "success", data: view })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { status: "error", message: "Neplatná data pohledu." },
        { status: 400 }
      )
    }

    console.error("POST /api/statistiky/views error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se uložit pohled." },
      { status: 500 }
    )
  }
}
