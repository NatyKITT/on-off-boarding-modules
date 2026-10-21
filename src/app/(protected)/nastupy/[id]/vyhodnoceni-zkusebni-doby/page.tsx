import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"
import type { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  PROBATION_EVALUATION_DISABLED_MESSAGE,
  PROBATION_EVALUATION_ENABLED,
} from "@/lib/probation-evaluation-flag"
import { buildFullName } from "@/lib/probation-evaluation-request"
import { canReadInternalApp } from "@/lib/rbac"

import { ProbationEvaluationPageClient } from "./probation-evaluation-page-client"

type Props = {
  params: { id: string }
}

export default async function VyhodnoceniZkusebniDobyPage({ params }: Props) {
  if (!PROBATION_EVALUATION_ENABLED) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-muted-foreground">
        {PROBATION_EVALUATION_DISABLED_MESSAGE}
      </div>
    )
  }

  const session = await auth()

  if (!session?.user) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(
        `/nastupy/${params.id}/vyhodnoceni-zkusebni-doby`
      )}`
    )
  }

  const role = (session.user.role ?? "USER") as Role

  if (!canReadInternalApp(role)) {
    redirect("/no-access")
  }

  const onboardingId = Number(params.id)

  if (Number.isNaN(onboardingId)) {
    notFound()
  }

  const onboarding = await prisma.employeeOnboarding.findFirst({
    where: {
      id: onboardingId,
      deletedAt: null,
    },
    select: {
      id: true,
      titleBefore: true,
      name: true,
      surname: true,
      titleAfter: true,
    },
  })

  if (!onboarding) {
    notFound()
  }

  const employeeName = buildFullName(onboarding)

  return (
    <ProbationEvaluationPageClient
      onboardingId={onboardingId}
      employeeName={employeeName}
    />
  )
}
