import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { canEditInternalApp } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  if (!canEditInternalApp(session.user.role)) {
    return NextResponse.json(
      { status: "error", message: "Nemáte oprávnění mazat pohledy." },
      { status: 403 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  try {
    await prisma.statisticsSavedView.delete({ where: { id } })

    return NextResponse.json({ status: "success" })
  } catch (error) {
    console.error("DELETE /api/statistiky/views/[id] error:", error)

    return NextResponse.json(
      { status: "error", message: "Nepodařilo se smazat pohled." },
      { status: 500 }
    )
  }
}
