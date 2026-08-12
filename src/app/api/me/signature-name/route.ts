import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { joinNameWithTitles } from "@/lib/format-name"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

export async function GET() {
  const session = await auth()

  if (!session?.user?.email) {
    return NextResponse.json(
      { message: "Nejste přihlášen(a)." },
      { status: 401 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
    },
  })

  const titledName = user
    ? joinNameWithTitles({
        titleBefore: user.titleBefore,
        name: user.name,
        surname: user.surname,
        titleAfter: user.titleAfter,
      })
    : ""

  return NextResponse.json({
    name: titledName || session.user.name || session.user.email,
  })
}
