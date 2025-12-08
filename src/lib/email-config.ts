import { prisma } from "@/lib/db"

type Channel = "planned" | "actual" | "all"

export async function recipientsFor(channel: Channel): Promise<string[]> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { key: "email_recipients" },
    })

    if (settings?.value) {
      const cfg = settings.value as { planned?: string[]; actual?: string[] }

      if (channel === "all") {
        const all = [...(cfg?.planned ?? []), ...(cfg?.actual ?? [])]
        return Array.from(new Set(all)).filter(Boolean)
      }

      const recipients = cfg?.[channel] ?? []
      if (recipients.length > 0) {
        return recipients.filter(Boolean)
      }
    }
  } catch (error) {
    console.warn("Nelze načíst příjemce z DB:", error)
  }

  const normalizeList = (val: string | undefined | null) =>
    (val ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)

  const planned = normalizeList(process.env.REPORT_RECIPIENTS_PLANNED)
  const actual = normalizeList(process.env.REPORT_RECIPIENTS_ACTUAL)

  console.log("📧 Načtení příjemců z ENV:")
  console.log("  Planned:", planned)
  console.log("  Actual:", actual)

  if (channel === "all") {
    return Array.from(new Set([...planned, ...actual])).filter(Boolean)
  }

  return channel === "planned" ? planned : actual
}
