import { NextRequest } from "next/server"
import { auth } from "@/auth"

import { buildEmploymentDocumentPdf } from "@/lib/employment-document-pdf"
import { canReadEmploymentDocuments } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()

  if (!session?.user) {
    return new Response(JSON.stringify({ message: "Nejste přihlášen(a)." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (!canReadEmploymentDocuments(session.user.role)) {
    return new Response(
      JSON.stringify({ message: "Nemáte oprávnění zobrazit PDF dokument." }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const id = Number(params.id)

  if (!id || Number.isNaN(id)) {
    return new Response(JSON.stringify({ message: "Neplatné ID dokumentu." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const result = await buildEmploymentDocumentPdf(id)

    if (!result) {
      return new Response(
        JSON.stringify({ message: "Dokument nebyl nalezen." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    return new Response(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="dokument-${id}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    const details =
      error instanceof Error ? error.message : JSON.stringify(error)
    console.error("PDF generation error", error)

    return new Response(
      JSON.stringify({
        message: "Nepodařilo se vygenerovat PDF.",
        details,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
