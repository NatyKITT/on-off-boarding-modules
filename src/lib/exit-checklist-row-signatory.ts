import type { ExitChecklistSignatureRecipient } from "@/types/exit-checklist"

export function resolveRowSignatoryOverrideName(
  rowKeys: string[],
  signatureRecipients: ExitChecklistSignatureRecipient[] | null | undefined
): string | null {
  if (rowKeys.length === 0) return null

  const active = (signatureRecipients ?? []).filter(
    (recipient) =>
      !recipient.revokedAt &&
      Boolean(recipient.invitedAt) &&
      recipient.rowKeys &&
      recipient.rowKeys.length > 0
  )

  if (active.length === 0) return null

  const names = rowKeys.map((key) => {
    const match = active.find((recipient) => recipient.rowKeys!.includes(key))
    return match?.name?.trim() || null
  })

  if (names.some((name) => name === null)) return null

  const [firstName, ...restNames] = names
  if (restNames.some((name) => name !== firstName)) return null

  return firstName
}
