import { NextResponse } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { getEmployees } from "@/lib/eos-employees"
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

  const normalizedEmail = session.user.email.trim().toLowerCase()

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
    },
  })

  let titledName = user
    ? joinNameWithTitles({
        titleBefore: user.titleBefore,
        name: user.name,
        surname: user.surname,
        titleAfter: user.titleAfter,
      })
    : ""

  const hasTitle = Boolean(
    user?.titleBefore?.trim() || user?.titleAfter?.trim()
  )

  if (!hasTitle) {
    try {
      const employees = await getEmployees("")
      const match = employees.find(
        (employee) => employee.email?.trim().toLowerCase() === normalizedEmail
      )

      if (match) {
        const eosTitledName = joinNameWithTitles({
          titleBefore: match.titleBefore,
          name: match.name,
          surname: match.surname,
          titleAfter: match.titleAfter,
        })

        if (eosTitledName) titledName = eosTitledName
      }
    } catch {}
  }

  return NextResponse.json({
    name: titledName || session.user.name || session.user.email,
  })
}
