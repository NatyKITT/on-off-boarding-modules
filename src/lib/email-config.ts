import { prisma } from "@/lib/db"
import { parseRecipientsEnv } from "@/lib/email"

type Channel = "planned" | "actual" | "all"

export async function recipientsFor(channel: Channel): Promise<string[]> {
  const plannedEnv = process.env.REPORT_RECIPIENTS_PLANNED || ""
  const actualEnv = process.env.REPORT_RECIPIENTS_ACTUAL || ""
  const allEnv = process.env.REPORT_RECIPIENTS_ALL || ""

  const envConfig = {
    planned: plannedEnv,
    actual: actualEnv,
    all: allEnv,
  }

  try {
    await prisma.systemSettings.upsert({
      where: { key: "email_recipients" },
      update: {
        value: envConfig,
        updatedBy: "system-env-sync",
        updatedAt: new Date(),
      },
      create: {
        key: "email_recipients",
        value: envConfig,
        updatedBy: "system-env-sync",
      },
    })
  } catch (error) {
    console.warn("Automatická synchronizace příjemců selhala:", error)
  }

  if (channel === "planned") {
    return dedupeValid(parseRecipientsEnv(plannedEnv))
  }
  if (channel === "actual") {
    return dedupeValid(parseRecipientsEnv(actualEnv))
  }

  const combined =
    parseRecipientsEnv(allEnv).length > 0
      ? parseRecipientsEnv(allEnv)
      : [...parseRecipientsEnv(plannedEnv), ...parseRecipientsEnv(actualEnv)]

  return dedupeValid(combined)
}

function isValidEmail(addr: string | null | undefined): addr is string {
  if (!addr) return false
  return addr.trim().includes("@")
}

function dedupeValid(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(isValidEmail)))
}
