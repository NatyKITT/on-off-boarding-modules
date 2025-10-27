import { Resend } from "resend"

import { env } from "@/env.mjs"

export type MailPayload = {
  to: string[]
  subject: string
  html: string
}

export async function sendMail({
  to,
  subject,
  html,
}: MailPayload): Promise<void> {
  if (!to?.length) throw new Error("Prázdní příjemci.")
  const resend = new Resend(env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to,
    subject,
    html,
  })
  if (error) throw error
}

export function recipientsFor(group: "planned" | "actual"): string[] {
  const src =
    group === "planned"
      ? process.env.REPORT_RECIPIENTS_PLANNED
      : process.env.REPORT_RECIPIENTS_ACTUAL

  return (src ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

interface EmailSender {
  send(payload: MailPayload): Promise<void>
}

class ResendEmailSender implements EmailSender {
  private client = new Resend(env.RESEND_API_KEY)
  async send({ to, subject, html }: MailPayload): Promise<void> {
    if (!to?.length) throw new Error("Prázdní příjemci.")
    const { error } = await this.client.emails.send({
      from: env.RESEND_EMAIL_FROM,
      to,
      subject,
      html,
    })
    if (error) throw error
  }
}

export function getEmailSender(): EmailSender {
  return new ResendEmailSender()
}
