import { redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import {
  buildFullName,
  isAllowedEmployeeEmail,
} from "@/lib/probation-evaluation-request"

import { PublicProbationEvaluationShell } from "./public-probation-evaluation-shell"

type Props = {
  params: { token: string }
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-bold">Odkaz není platný</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Formulář vyhodnocení zkušební doby nebyl nalezen nebo už není
          dostupný.
        </p>
      </div>
    </div>
  )
}

export default async function PublicProbationEvaluationPage({ params }: Props) {
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
