export function recipientIdentityKey(recipient: {
  email: string
  behalfLabel?: string | null
}): string {
  const email = recipient.email.trim().toLowerCase()
  const behalf = (recipient.behalfLabel ?? "").trim().toLowerCase()

  return `${email}::${behalf}`
}

export function entryIdentityKey(recipient: {
  id?: string | null
  email: string
  behalfLabel?: string | null
}): string {
  if (recipient.id) return `id::${recipient.id}`
  return recipientIdentityKey(recipient)
}

export function generateRecipientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function isActiveSignatureRecipient(
  email: string | null | undefined,
  recipients: { email: string; revokedAt?: string | null }[] | null | undefined
): boolean {
  const normalized = (email ?? "").trim().toLowerCase()
  if (!normalized) return false

  return (recipients ?? []).some(
    (recipient) =>
      recipient.email.trim().toLowerCase() === normalized &&
      !recipient.revokedAt
  )
}
