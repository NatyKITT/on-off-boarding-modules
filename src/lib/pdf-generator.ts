import { readFile } from "fs/promises"
import path from "path"

import fontkit from "@pdf-lib/fontkit"
import { PDFDocument, rgb } from "pdf-lib"

import { prisma } from "@/lib/db"

export async function generateEmploymentDocumentPDF(
  documentId: number
): Promise<Buffer> {
  const doc = await prisma.employmentDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      type: true,
      status: true,
      data: true,
      completedAt: true,
      onboarding: {
        select: {
          name: true,
          surname: true,
        },
      },
    },
  })

  if (!doc) {
    throw new Error("Dokument nebyl nalezen")
  }

  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)

  const fontPath = path.join(
    process.cwd(),
    "public",
    "assets",
    "fonts",
    "NotoSans-Regular.ttf"
  )
  const fontBytes = await readFile(fontPath)
  const font = await pdfDoc.embedFont(fontBytes)

  const employeeName = [doc.onboarding?.name, doc.onboarding?.surname]
    .filter(Boolean)
    .join(" ")

  const page = pdfDoc.addPage([595, 842]) // A4
  const { height } = page.getSize()

  page.drawText(employeeName || "Dokument", {
    x: 50,
    y: height - 50,
    size: 18,
    font,
    color: rgb(0, 0, 0),
  })

  page.drawText(`Typ: ${doc.type}`, {
    x: 50,
    y: height - 80,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })

  const bytes = await pdfDoc.save()
  return Buffer.from(bytes)
}
