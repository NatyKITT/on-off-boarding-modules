import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

import { OffboardingDetailPageClient } from "./offboarding-detail-page-client"

type OffboardingDetail = {
  id: number
  status: "NEW" | "IN_PROGRESS" | "COMPLETED"
  plannedEnd: string
  actualEnd?: string | null
  noticeEnd?: string | null
  noticeMonths?: number | null
  hasCustomDates?: boolean

  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null

  positionNum: string
  positionName: string
  department: string
  unitName: string

  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
}

interface PageProps {
  params: { id: string }
}

export default async function OffboardingDetailPage({ params }: PageProps) {
  const session = await auth()

  if (!session?.user) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(`/odchody/${params.id}`)}`
    )
  }

  const id = Number(params.id)
  if (Number.isNaN(id)) {
    notFound()
  }

  const record = await prisma.employeeOffboarding.findUnique({
    where: {
      id,
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      plannedEnd: true,
      actualEnd: true,
      noticeEnd: true,
      noticeMonths: true,
      hasCustomDates: true,

      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,

      positionNum: true,
      positionName: true,
      department: true,
      unitName: true,

      userName: true,
      userEmail: true,
      personalNumber: true,
      notes: true,
    },
  })

  if (!record) {
    notFound()
  }

  const data: OffboardingDetail = {
    ...record,
    plannedEnd: record.plannedEnd.toISOString(),
    actualEnd: record.actualEnd?.toISOString() ?? null,
    noticeEnd: record.noticeEnd?.toISOString() ?? null,
  }

  return <OffboardingDetailPageClient data={data} />
}
