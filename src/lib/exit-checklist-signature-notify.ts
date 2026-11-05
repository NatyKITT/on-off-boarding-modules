import { format } from "date-fns"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { prisma } from "@/lib/db"
import {
  sendExitChecklistLockedIncompleteHrEmail,
  sendExitChecklistSignatureAvailableAgainEmail,
  sendExitChecklistSignatureNoLongerNeededEmail,
  type ExitChecklistSignatureNoLongerNeededReason,
} from "@/lib/email"
import {
  getOrCreateChecklist,
  mapToExitChecklistData,
} from "@/lib/exit-checklist"
import { logExitChecklistEvent } from "@/lib/exit-checklist-events"
import { cancelExitChecklistSignatureJobsForOffboarding } from "@/lib/mail-queue-cleanup"
import {
  resolveBehalfOriginalInfo,
  resolveSignatureRecipientStatus,
} from "@/lib/offboarding-cron-jobs"
import { getHrRecipientsFromEnv } from "@/lib/probation-evaluation-request"

export async function notifyExitChecklistSignersOffboardingRemoved(
  offboardingId: number,
  reason: "RECORD_CANCELLED" | "RECORD_DELETED" | "LOCKED"
): Promise<void> {
  const result = await getOrCreateChecklist(offboardingId)

  if (!result) return

  const { off, checklist } = result
  const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

  if (!data.signatureRecipientsSentAt) return
  if (!data.signatureRecipients?.length) return

  const employeeName = [off.titleBefore, off.name, off.surname, off.titleAfter]
    .filter(Boolean)
    .join(" ")
    .trim()

  const employmentEndDate = off.actualEnd ?? off.plannedEnd
  const mappedReason: ExitChecklistSignatureNoLongerNeededReason = reason

  for (const recipient of data.signatureRecipients) {
    const email = recipient.email?.trim().toLowerCase()

    if (!email || recipient.revokedAt) continue

    const { hasSigned, label, pendingItems } = resolveSignatureRecipientStatus(
      data,
      off.userEmail,
      recipient
    )

    if (hasSigned) continue

    const isManager = label === "vedoucí" || label === "vedoucí (zastoupení)"
    const behalfOriginal = resolveBehalfOriginalInfo(data, recipient)

    try {
      await sendExitChecklistSignatureNoLongerNeededEmail({
        to: recipient.email,
        employeeName,
        employeePosition: off.positionName,
        employeeDepartment: off.department,
        employmentEndDate,
        reason: mappedReason,
        isManager,
        behalfName: behalfOriginal?.name ?? recipient.behalfLabel ?? null,
        behalfPosition: behalfOriginal?.position ?? null,
        behalfDepartment: behalfOriginal?.department ?? null,
        pendingItems,
      })
    } catch (error) {
      console.error(
        "[EXIT-CHECKLIST-NOTIFY] E-mail se nepodařilo odeslat:",
        error
      )
    }
  }
}

/**
 * Po odemčení výstupního listu pošle nepodepsaným aktivní podepisující
 * (kteří ještě nepodepsali) informaci, že výstupní list je zase otevřený
 * a mohou podepsat, s funkčním přihlašovacím odkazem.
 */
export async function notifyExitChecklistSignersAvailableAgain(
  offboardingId: number,
  baseUrl: string
): Promise<void> {
  const result = await getOrCreateChecklist(offboardingId)

  if (!result) return

  const { off, checklist } = result

  if (!checklist.publicToken) return

  const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

  if (!data.signatureRecipientsSentAt) return
  if (!data.signatureRecipients?.length) return

  const employeeName = [off.titleBefore, off.name, off.surname, off.titleAfter]
    .filter(Boolean)
    .join(" ")
    .trim()

  const employmentEndDate = off.actualEnd ?? off.plannedEnd
  const signUrl = `${baseUrl}/odchody-public/${checklist.publicToken}`

  for (const recipient of data.signatureRecipients) {
    const email = recipient.email?.trim().toLowerCase()

    if (!email || recipient.revokedAt) continue

    const { hasSigned, label, pendingItems } = resolveSignatureRecipientStatus(
      data,
      off.userEmail,
      recipient
    )

    if (hasSigned) continue

    const isManager = label === "vedoucí" || label === "vedoucí (zastoupení)"
    const behalfOriginal = resolveBehalfOriginalInfo(data, recipient)

    try {
      await sendExitChecklistSignatureAvailableAgainEmail({
        to: recipient.email,
        employeeName,
        employeePosition: off.positionName,
        employeeDepartment: off.department,
        employmentEndDate,
        signUrl,
        isManager,
        behalfName: behalfOriginal?.name ?? recipient.behalfLabel ?? null,
        behalfPosition: behalfOriginal?.position ?? null,
        behalfDepartment: behalfOriginal?.department ?? null,
        pendingItems,
      })
    } catch (error) {
      console.error(
        "[EXIT-CHECKLIST-NOTIFY] E-mail se nepodařilo odeslat:",
        error
      )
    }
  }
}

/**
 * Zamkne výstupní list (pokud ještě není) a provede stejné kroky jako
 * manuální uzamčení přes PUT /exit-checklist - zruší čekající připomínky
 * k podpisu a nepodepsaným pošle informaci, že už není potřeba podepisovat.
 * Volá se při potvrzení skutečného odchodu, pokud to HR potvrdí v dialogu.
 */
export async function lockExitChecklistAndNotify(args: {
  offboardingId: number
  lockedById: string | null
  baseUrl?: string | null
}): Promise<{ locked: boolean }> {
  const result = await getOrCreateChecklist(args.offboardingId)

  if (!result) return { locked: false }

  const { off, checklist } = result

  if (checklist.lockedAt) return { locked: false }

  const data: ExitChecklistData = mapToExitChecklistData(off, checklist)

  await prisma.exitChecklist.update({
    where: { id: checklist.id },
    data: { lockedAt: new Date(), lockedById: args.lockedById },
  })

  await logExitChecklistEvent({
    checklistId: checklist.id,
    action: "LOCKED",
    by: args.lockedById,
    message: "Výstupní list byl uzamčen po potvrzení skutečného odchodu.",
  })

  try {
    await cancelExitChecklistSignatureJobsForOffboarding(args.offboardingId)
  } catch (error) {
    console.error(
      "[EXIT-CHECKLIST-LOCK] Čištění fronty připomínek k podpisu se nepodařilo:",
      error
    )
  }

  try {
    await notifyExitChecklistSignersOffboardingRemoved(
      args.offboardingId,
      "LOCKED"
    )
  } catch (error) {
    console.error(
      "[EXIT-CHECKLIST-LOCK] Notifikace podepisujících se nepodařila:",
      error
    )
  }

  try {
    const hrRecipients = getHrRecipientsFromEnv()
    const pendingSigners = (data.signatureRecipients ?? [])
      .filter((recipient) => recipient.email && !recipient.revokedAt)
      .map((recipient) => {
        const { hasSigned, pendingItems } = resolveSignatureRecipientStatus(
          data,
          off.userEmail,
          recipient
        )
        const behalfOriginal = resolveBehalfOriginalInfo(data, recipient)

        return {
          hasSigned,
          name: recipient.name,
          position: recipient.position ?? null,
          department: recipient.department ?? null,
          behalfLabel: behalfOriginal?.name ?? recipient.behalfLabel ?? null,
          pendingItems,
        }
      })
      .filter((recipient) => !recipient.hasSigned)

    const unresolvedItems = data.items
      .filter((item) => item.resolved === "NO")
      .map((item) => {
        const who = item.signedByName
          ? `${item.signedByName}${
              item.signedAt
                ? ` · ${format(new Date(item.signedAt), "d.M.yyyy HH:mm")}`
                : ""
            }`
          : "nepodepsáno"
        const noteSuffix = item.note ? ` — poznámka: ${item.note}` : ""
        const additionalNoteSuffix = item.additionalNote
          ? ` — dodatečně vyřízeno: ${item.additionalNote}`
          : ""

        return `${item.obligation} (${item.organization}) · ${who}${noteSuffix}${additionalNoteSuffix}`
      })

    if (hrRecipients.length > 0 && pendingSigners.length > 0) {
      const employeeName = [
        off.titleBefore,
        off.name,
        off.surname,
        off.titleAfter,
      ]
        .filter(Boolean)
        .join(" ")
        .trim()

      await sendExitChecklistLockedIncompleteHrEmail({
        to: hrRecipients,
        employeeName,
        employeePersonalNumber: off.personalNumber,
        employeePosition: off.positionName,
        employeeDepartment: off.department,
        employeeUnitName: off.unitName,
        employmentEndDate: off.actualEnd ?? off.plannedEnd,
        checklistLink: args.baseUrl
          ? `${args.baseUrl}/odchody/${args.offboardingId}/vystupni-list`
          : null,
        pendingSigners,
        unresolvedItems,
      })
    }
  } catch (error) {
    console.error(
      "[EXIT-CHECKLIST-LOCK] Oznámení HR o nekompletním podpisu se nepodařilo:",
      error
    )
  }

  return { locked: true }
}
