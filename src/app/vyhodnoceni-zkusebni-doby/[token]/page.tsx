import { redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { PROBATION_EVALUATION_ENABLED } from "@/lib/probation-evaluation-flag"
import {
  buildFullName,
  isAllowedEmployeeEmail,
} from "@/lib/probation-evaluation-request"

import { PublicLinkInvalid } from "@/components/common/public-link-invalid"

import { PublicProbationEvaluationShell } from "./public-probation-evaluation-shell"

type Props = {
  params: { token: string }
}

function InvalidLink() {
  return (
    <PublicLinkInvalid description="Formulář vyhodnocení zkušební doby nebyl nalezen nebo už není dostupný." />
  )
}

function DisabledNotice() {
  return (
    <PublicLinkInvalid description="Vyhodnocení zkušební doby bylo přesunuto do Systemizace. Tento odkaz už není aktivní." />
  )
}

export default async function PublicProbationEvaluationPage({ params }: Props) {
  if (!PROBATION_EVALUATION_ENABLED) {
    return <DisabledNotice />
  }

  const token = params.token?.trim()

  const session = await auth()

  if (!session?.user) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(
        `/vyhodnoceni-zkusebni-doby/${token}`
      )}`
    )
  }

  if (!isAllowedEmployeeEmail(session.user.email)) {
    redirect("/no-access")
  }

  if (!token) {
    return <InvalidLink />
  }

  const request = await prisma.probationEvaluationRequest.findUnique({
    where: {
      token,
    },
    select: {
      id: true,
      onboarding: {
        select: {
          deletedAt: true,
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
        },
      },
    },
  })

  if (!request || request.onboarding.deletedAt) {
    return <InvalidLink />
  }

  const employeeName = buildFullName(request.onboarding)

  return (
    <PublicProbationEvaluationShell token={token} employeeName={employeeName} />
  )
}
