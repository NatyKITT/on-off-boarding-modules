import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

import { EmployeeChangeDetailClient } from "./employee-change-detail-client"

interface PageProps {
  params: { id: string }
}

function normalizePersonalNumber(value: string | null | undefined) {
  return value?.trim() ?? ""
}

async function getLinkCounts(personalNumber: string | null | undefined) {
  const pn = normalizePersonalNumber(personalNumber)

  if (!pn) {
    return {
      onboardingMatchesCount: 0,
      offboardingMatchesCount: 0,
      linkCandidateCount: 0,
    }
  }

  const [onboardingMatchesCount, offboardingMatchesCount] = await Promise.all([
    prisma.employeeOnboarding.count({
      where: {
        deletedAt: null,
        personalNumber: pn,
      },
    }),
    prisma.employeeOffboarding.count({
      where: {
        deletedAt: null,
        personalNumber: pn,
      },
    }),
  ])

  return {
    onboardingMatchesCount,
    offboardingMatchesCount,
    linkCandidateCount: onboardingMatchesCount + offboardingMatchesCount,
  }
}

export default async function EmployeeChangeDetailPage({ params }: PageProps) {
  const session = await auth()

  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/zmeny/${params.id}`)}`)
  }

  const id = Number(params.id)

  if (!Number.isFinite(id)) notFound()

  const record = await prisma.employeeChange.findFirst({
    where: {
      id,
      deletedAt: null,
    },
  })

  if (!record) notFound()

  const counts = await getLinkCounts(record.personalNumber)

  const data = {
    ...record,
    effectiveDate: record.effectiveDate.toISOString(),
    appliedAt: record.appliedAt?.toISOString() ?? null,
    emailSentAt: record.emailSentAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
    targets: [],
    ...counts,
    infoOnly: true,
  }

  return <EmployeeChangeDetailClient data={data} />
}
