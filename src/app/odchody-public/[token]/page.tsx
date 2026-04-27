import { redirect } from "next/navigation"
import { auth } from "@/auth"

import {
  getChecklistByPublicToken,
  isPraha6OrKitt6,
} from "@/lib/exit-checklist"

import { PublicExitChecklistShell } from "./public-exit-checklist-shell"

type Props = {
  params: { token: string }
}

export default async function PublicExitChecklistPage({ params }: Props) {
  const session = await auth()

  if (!session?.user) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(`/odchody-public/${params.token}`)}`
    )
  }

  if (!isPraha6OrKitt6(session.user.email)) {
    redirect("/no-access")
  }

  const checklist = await getChecklistByPublicToken(params.token)

  if (!checklist) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <h1 className="text-2xl font-bold">Odkaz není platný</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Výstupní list nebyl nalezen nebo už není dostupný.
          </p>
        </div>
      </div>
    )
  }

  const role = session.user.role ?? "USER"

  if (["ADMIN", "HR", "IT", "READONLY"].includes(role)) {
    redirect(`/odchody/${checklist.offboardingId}/vystupni-list`)
  }

  const employeeName = [
    checklist.offboarding.titleBefore,
    checklist.offboarding.name,
    checklist.offboarding.surname,
    checklist.offboarding.titleAfter,
  ]
    .filter(Boolean)
    .join(" ")
    .trim()

  return (
    <PublicExitChecklistShell
      token={params.token}
      employeeName={employeeName}
    />
  )
}
