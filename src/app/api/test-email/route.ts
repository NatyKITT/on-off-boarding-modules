import { NextResponse } from "next/server"
import { Resend } from "resend"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST() {
  try {
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL!,
      to: ["test@yourcompany.com"],
      subject: "Test email z HR systému",
      html: "<h1>Resend funguje!</h1><p>Email systém je nakonfigurován správně.</p>",
    })

    return NextResponse.json({
      status: "success",
      messageId: result.data?.id,
      result,
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}
