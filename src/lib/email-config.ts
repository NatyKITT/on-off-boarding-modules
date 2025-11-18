import { prisma } from "@/lib/db"

type Channel = "planned" | "actual" | "all"

export async function recipientsFor(channel: Channel): Promise<string[]> {
  const settings = await prisma.systemSettings.findUnique({
    where: { key: "email_recipients" },
  })
  if (settings?.value) {
    const cfg = settings.value as { planned?: string[]; actual?: string[] }
    if (channel === "all") {
      return Array.from(
        new Set([...(cfg?.planned ?? []), ...(cfg?.actual ?? [])])
      ).filter(Boolean)
    }
    return (cfg?.[channel] ?? []).filter(Boolean)
  }
  const planned = (process.env.REPORT_RECIPIENTS_PLANNED ?? "")
    .split(",")
    .map((s) => s.trim())
  const actual = (process.env.REPORT_RECIPIENTS_ACTUAL ?? "")
    .split(",")
    .map((s) => s.trim())
  return channel === "all"
    ? Array.from(new Set([...planned, ...actual])).filter(Boolean)
    : (channel === "planned" ? planned : actual).filter(Boolean)
}
