import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

import { ExitChecklistPageClient } from "./exit-checklist-page-client"

type Props = {
  params: { id: string }
}

export default async function VystupniListPage({ params }: Props) {
  const session = await auth()

  if (!session?.user) {
    redirect("/signin")
  }

  const offboardingId = Number(params.id)
  if (Number.isNaN(offboardingId)) notFound()

  const offboarding = await prisma.employeeOffboarding.findUnique({
    where: { id: offboardingId },
    select: {
      id: true,
      name: true,
      surname: true,
      titleBefore: true,
      titleAfter: true,
    },
  })

  if (!offboarding) notFound()

  const employeeName = [
    offboarding.titleBefore,
    offboarding.name,
    offboarding.surname,
    offboarding.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  return (
    <ExitChecklistPageClient
      offboardingId={offboardingId}
      employeeName={employeeName}
    />
  )
}
