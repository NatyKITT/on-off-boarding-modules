import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  buildLinkedOnboardingInfo,
  normalizePersonalNumber,
  pickMostRelevantOnboarding,
} from "@/lib/employment-linking"
import { canAccessInternalApp } from "@/lib/rbac"

import { OffboardingDetailPageClient } from "./offboarding-detail-page-client"

type LinkedOnboardingInfo = {
  id: number
  plannedStart: string | null
  actualStart: string | null
  probationEnd: string | null
  positionName: string | null
  exitDuringProbation: boolean
  isCancelled: boolean
  label: string
  description: string
}

type OffboardingDetail = {
  id: number
  status: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  plannedEnd: string
  actualEnd?: string | null
  noticeEnd?: string | null
  noticeMonths?: number | null
  hasCustomDates?: boolean

  cancelledAt?: string | null
  cancelledBy?: string | null
  cancelReason?: string | null

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

  probationStopDecision?: "STOP" | "KEEP" | null
  probationStopDecisionAt?: string | null
  probationStopDecisionBy?: string | null
  probationStopNote?: string | null

  linkedOnboarding?: LinkedOnboardingInfo | null
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

  const role = session.user.role ?? "USER"

  if (!canAccessInternalApp(role)) {
    redirect("/no-access")
  }

  const id = Number(params.id)

  if (Number.isNaN(id)) {
    notFound()
  }

  const record = await prisma.employeeOffboarding.findFirst({
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

      cancelledAt: true,
      cancelledBy: true,
      cancelReason: true,

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

      probationStopDecision: true,
      probationStopDecisionAt: true,
      probationStopDecisionBy: true,
      probationStopNote: true,
    },
  })

  if (!record) {
    notFound()
  }

  const normalizedPersonalNumber = normalizePersonalNumber(
    record.personalNumber
  )

  const possibleOnboardings = normalizedPersonalNumber
    ? await prisma.employeeOnboarding.findMany({
        where: {
          deletedAt: null,
          personalNumber: {
            not: null,
          },
        },
        select: {
          id: true,
          personalNumber: true,
          plannedStart: true,
          actualStart: true,
          probationEnd: true,
          positionName: true,
          cancelledAt: true,
        },
      })
    : []

  const linkedOnboardingSource = normalizedPersonalNumber
    ? pickMostRelevantOnboarding(
        possibleOnboardings.filter((onboarding) => {
          return (
            normalizePersonalNumber(onboarding.personalNumber) ===
            normalizedPersonalNumber
          )
        })
      )
    : null

  const linkedOnboarding = buildLinkedOnboardingInfo({
    onboarding: linkedOnboardingSource,
    exitDate: record.actualEnd ?? record.plannedEnd,
  })

  let probationStopDecisionByName = record.probationStopDecisionBy

  if (probationStopDecisionByName) {
    const decisionUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: probationStopDecisionByName },
          { email: probationStopDecisionByName },
        ],
      },
      select: { name: true, surname: true, email: true },
    })

    if (decisionUser?.name && decisionUser?.surname) {
      probationStopDecisionByName = `${decisionUser.name} ${decisionUser.surname}`
    } else if (decisionUser?.email) {
      probationStopDecisionByName = decisionUser.email
    }
  }

  const data: OffboardingDetail = {
    ...record,
    plannedEnd: record.plannedEnd.toISOString(),
    actualEnd: record.actualEnd?.toISOString() ?? null,
    noticeEnd: record.noticeEnd?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    probationStopDecisionAt:
      record.probationStopDecisionAt?.toISOString() ?? null,
    probationStopDecisionBy: probationStopDecisionByName,
    linkedOnboarding,
  }

  return <OffboardingDetailPageClient data={data} />
}
