import fs from "fs/promises"
import path from "path"

import fontkit from "@pdf-lib/fontkit"
import type { PDFDocument, PDFFont } from "pdf-lib"

export type PdfFontSet = {
  regular: PDFFont
  bold: PDFFont
}

const ARIAL_FONT_DIR = path.join(process.cwd(), "src", "fonts")

const ARIAL_REGULAR_FONT_CANDIDATES = [
  path.join(ARIAL_FONT_DIR, "Arial.ttf"),
  path.join(ARIAL_FONT_DIR, "arial.ttf"),
]

const ARIAL_BOLD_FONT_CANDIDATES = [
  path.join(ARIAL_FONT_DIR, "Arial-Bold.ttf"),
  path.join(ARIAL_FONT_DIR, "arialbd.ttf"),
  path.join(ARIAL_FONT_DIR, "ArialBold.ttf"),
]

async function readFirstExistingFile(paths: string[]) {
  for (const filePath of paths) {
    try {
      return await fs.readFile(filePath)
    } catch {}
  }

  return null
}

async function readRequiredFont(paths: string[], label: string) {
  const bytes = await readFirstExistingFile(paths)

  if (!bytes) {
    throw new Error(
      `Chybí font ${label}. Vložte soubor do src/fonts, např. src/fonts/Arial.ttf a src/fonts/Arial-Bold.ttf.`
    )
  }

  return bytes
}

export async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFontSet> {
  pdf.registerFontkit(fontkit)

  const [regularFontBytes, boldFontBytes] = await Promise.all([
    readRequiredFont(ARIAL_REGULAR_FONT_CANDIDATES, "Arial"),
    readRequiredFont(ARIAL_BOLD_FONT_CANDIDATES, "Arial Bold"),
  ])

  const regular = await pdf.embedFont(regularFontBytes, { subset: false })
  const bold = await pdf.embedFont(boldFontBytes, { subset: false })

  return {
    regular,
    bold,
  }
}
