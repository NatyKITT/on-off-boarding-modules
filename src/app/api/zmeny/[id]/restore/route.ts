import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function POST(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const record = await prisma.employeeChange.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      surname: true,
      deletedAt: true,
    },
  })

  if (!record) {
    return NextResponse.json(
      { status: "error", message: "Záznam nenalezen." },
      { status: 404 }
    )
  }

  if (!record.deletedAt) {
    return NextResponse.json(
      { status: "error", message: "Záznam není smazán." },
      { status: 409 }
    )
  }

  await prisma.employeeChange.update({
    where: { id },
    data: {
      deletedAt: null,
      deletedBy: null,
      deleteReason: null,
      updatedAt: new Date(),
    },
  })

  return NextResponse.json({
    status: "success",
    message: "Záznam byl úspěšně obnoven.",
    data: {
      id: record.id,
      name: `${record.name} ${record.surname}`,
    },
  })
}
