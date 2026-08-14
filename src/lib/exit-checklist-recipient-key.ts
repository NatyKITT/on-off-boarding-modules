export function recipientIdentityKey(recipient: {
  email: string
  behalfLabel?: string | null
}): string {
  const email = recipient.email.trim().toLowerCase()
  const behalf = (recipient.behalfLabel ?? "").trim().toLowerCase()

  return `${email}::${behalf}`
}
