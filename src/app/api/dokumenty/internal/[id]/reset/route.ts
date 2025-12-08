import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/db"

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = Number(params.id)
  if (Number.isNaN(id)) {
    return new NextResponse("Neplatné ID dokumentu.", { status: 400 })
  }

  try {
    const doc = await prisma.employmentDocument.update({
      where: { id },
      data: {
        data: Prisma.JsonNull,
        status: "DRAFT",
        completedAt: null,
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        type: true,
      },
    })

    return NextResponse.json(doc)
  } catch (error) {
    console.error(error)
    return new NextResponse("Reset dokumentu se nezdařil.", { status: 500 })
  }
}
