import { Resend } from "resend"

import { env } from "@/env.mjs"

const resend = new Resend(env.RESEND_API_KEY)

export async function sendTestEmail() {
  const { error, data } = await resend.emails.send({
    from: env.RESEND_EMAIL_FROM,
    to: env.RESEND_EMAIL_TO,
    subject: "Test z On/Offboarding (Resend)",
    html: "<p>Funguje to ✅</p>",
  })
  if (error) throw error
  return data
}
