import { redirect } from "next/navigation"
import { auth } from "@/auth"

import {
  getChecklistByPublicToken,
  isPraha6OrKitt6,
} from "@/lib/exit-checklist"

import { PublicLinkInvalid } from "@/components/common/public-link-invalid"

import { PublicExitChecklistShell } from "./public-exit-checklist-shell"

type Props = {
  params: { token: string }
}

export default async function PublicExitChecklistPage({ params }: Props) {
  const session = await auth()

  if (!session?.user) {
    redirect(
      `/signin?callbackUrl=${encodeURIComponent(
        `/odchody-public/${params.token}`
      )}`
    )
  }

  if (!isPraha6OrKitt6(session.user.email)) {
    redirect("/no-access")
  }

  const checklist = await getChecklistByPublicToken(params.token)

  if (!checklist) {
    return (
      <PublicLinkInvalid description="Výstupní list nebyl nalezen nebo už není dostupný." />
    )
  }

  return <PublicExitChecklistShell token={params.token} />
}
