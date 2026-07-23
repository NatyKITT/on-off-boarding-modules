import { NextRequest } from "next/server"

import { prisma } from "@/lib/db"
import { buildEmploymentDocumentPdf } from "@/lib/employment-document-pdf"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  { params }: { params: { hash: string } }
) {
  const hash = params.hash

  if (!hash || typeof hash !== "string") {
    return new Response(
      JSON.stringify({ message: "Neplatný přístupový hash." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    const doc = await prisma.employmentDocument.findFirst({
      where: { accessHash: hash },
      select: {
        id: true,
        type: true,
        status: true,
        expiresAt: true,
      },
    })

    if (!doc) {
      return new Response(
        JSON.stringify({ message: "Dokument nebyl nalezen." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const now = new Date()

    if (doc.expiresAt && doc.expiresAt < now) {
      return new Response(
        JSON.stringify({ message: "Odkaz na dokument již vypršel." }),
        {
          status: 410,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    if (doc.type !== "PAYROLL_INFO") {
      return new Response(
        JSON.stringify({
          message: "Tento typ dokumentu není dostupný přes veřejný endpoint.",
          allowedTypes: ["PAYROLL_INFO"],
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    if (doc.status !== "SIGNED" && doc.status !== "COMPLETED") {
      return new Response(
        JSON.stringify({ message: "Dokument ještě nebyl vyplněn." }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const result = await buildEmploymentDocumentPdf(doc.id)

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
        "Content-Disposition": `inline; filename="dokument-${doc.id}.pdf"`,
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
