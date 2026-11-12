import { redirect } from "next/navigation"
import { auth } from "@/auth"

import {
  getChecklistByPublicToken,
  isPraha6OrKitt6,
  mapToExitChecklistData,
} from "@/lib/exit-checklist"
import { isActiveSignatureRecipient } from "@/lib/exit-checklist-recipient-key"

import { PublicLinkInvalid } from "@/components/common/public-link-invalid"

import { PublicExitChecklistShell } from "./public-exit-checklist-shell"

function normalizeEmail(value?: string | null) {
  return (value ?? "").trim().toLowerCase()
}

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

  const data = mapToExitChecklistData(checklist.offboarding, checklist)
  const currentUserEmailNormalized = normalizeEmail(session.user.email)
  const isAuthorizedForChecklist =
    (Boolean(data.employeeEmail) &&
      normalizeEmail(data.employeeEmail) === currentUserEmailNormalized) ||
    isActiveSignatureRecipient(
      session.user.email,
      data.signatureRecipients ?? []
    )

  if (!isAuthorizedForChecklist) {
    return (
      <PublicLinkInvalid
        title="Nemáte přístup"
        description="Nejste (nebo už nejste) v seznamu osob pozvaných k podpisu tohoto výstupního listu. Pokud si myslíte, že byste mezi podepisujícími být měl(a), požádejte Personální oddělení o přidání do seznamu příjemců."
      />
    )
  }

  return (
    <PublicExitChecklistShell
      token={params.token}
      currentUserEmail={session.user.email ?? ""}
    />
  )
}
