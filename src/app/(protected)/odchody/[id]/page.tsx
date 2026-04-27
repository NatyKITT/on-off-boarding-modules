import { notFound } from "next/navigation"

import { absoluteUrl } from "@/lib/utils"

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
  const id = Number(params.id)
  if (Number.isNaN(id)) notFound()

  const res = await fetch(absoluteUrl(`/api/odchody/${params.id}`), {
    cache: "no-store",
  })

  if (!res.ok) {
    notFound()
  }

  const json = (await res.json()) as {
    status?: string
    data?: OffboardingDetail
  }

  if (!json.data) {
    notFound()
  }

  return <OffboardingDetailPageClient data={json.data} />
}
