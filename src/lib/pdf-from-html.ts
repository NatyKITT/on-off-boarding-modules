import { existsSync } from "fs"

import puppeteer from "puppeteer"

const WINDOWS_BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]

function resolvePuppeteerExecutablePath(): string | undefined {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }

  if (process.platform === "win32") {
    return WINDOWS_BROWSER_CANDIDATES.find((path) => existsSync(path))
  }

  return undefined
}

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: resolvePuppeteerExecutablePath(),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  try {
    const page = await browser.newPage()
    await page.emulateMediaType("print")
    await page.setContent(html, { waitUntil: "load" })
    await page.addStyleTag({
      content: `
        .eml-print-card { border-radius: 0 !important; overflow: visible !important; }
        body.eml-print-page, table.eml-print-page { background-color: #ffffff !important; }
      `,
    })

    await page.evaluate(() => {
      const EMPLOYEE_COLUMN_WIDTHS: Record<number, string[]> = {
        5: ["34%", "24%", "20%", "11%", "11%"],
        7: ["26%", "8%", "8%", "20%", "18%", "10%", "10%"],
      }

      for (const table of Array.from(document.querySelectorAll("table"))) {
        const thead = table.querySelector("thead")
        const tbody = table.querySelector("tbody")
        if (!thead || !tbody || tbody.rows.length < 2) continue

        thead.style.display = "table-header-group"
        for (const row of Array.from(tbody.rows)) {
          row.style.breakInside = "avoid"
          ;(
            row.style as CSSStyleDeclaration & { pageBreakInside: string }
          ).pageBreakInside = "avoid"
        }

        const headerCells = Array.from(thead.querySelectorAll("th"))
        const headerTexts = headerCells.map((th) => th.textContent?.trim())
        const widths = EMPLOYEE_COLUMN_WIDTHS[headerCells.length]

        if (headerTexts[0] === "Zaměstnanec" && widths) {
          ;(table as HTMLTableElement).style.tableLayout = "fixed"
          headerCells.forEach((th, index) => {
            th.style.width = widths[index]
          })

          const lastColumnIndex = headerCells.length - 1
          const lastHeaderCell = headerCells[lastColumnIndex]
          if (lastHeaderCell) {
            lastHeaderCell.style.whiteSpace = "normal"
          }
          for (const row of Array.from(tbody.rows)) {
            const cell = row.cells[lastColumnIndex]
            if (cell) {
              cell.style.whiteSpace = "normal"
              cell.style.wordBreak = "break-word"
            }
          }
        }
      }
    })

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "14mm", bottom: "14mm", left: "10mm", right: "10mm" },
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
