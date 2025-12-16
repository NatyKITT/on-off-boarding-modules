import { prisma } from "@/lib/db"
import { parseRecipientsEnv } from "@/lib/email"

type Channel = "planned" | "actual" | "all"

type DbRecipientsValue = string | string[] | null
type DbRecipientsConfig = {
  planned?: DbRecipientsValue
  actual?: DbRecipientsValue
  all?: DbRecipientsValue
}

function isValidEmail(addr: string | null | undefined): addr is string {
  if (!addr) return false
  const v = addr.trim()
  if (!v) return false
  return v.includes("@")
}

function dedupeValid(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(isValidEmail)))
}

function normalizeDbValue(value: DbRecipientsValue): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return dedupeValid(value)
  }
  return dedupeValid(parseRecipientsEnv(value))
}

export async function recipientsFor(channel: Channel): Promise<string[]> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { key: "email_recipients" },
    })

    if (settings?.value) {
      const cfg = settings.value as DbRecipientsConfig

      const plannedDb = normalizeDbValue(cfg.planned ?? null)
      const actualDb = normalizeDbValue(cfg.actual ?? null)
      const allDb = normalizeDbValue(cfg.all ?? null)

      if (channel === "planned" && plannedDb.length) {
        return plannedDb
      }

      if (channel === "actual" && actualDb.length) {
        return actualDb
      }

      if (channel === "all") {
        if (allDb.length) {
          return allDb
        }

        if (plannedDb.length || actualDb.length) {
          return dedupeValid([...plannedDb, ...actualDb])
        }
      }
    }
  } catch (error) {
    console.warn("Nelze načíst příjemce z DB:", error)
  }

  const plannedEnv = parseRecipientsEnv(process.env.REPORT_RECIPIENTS_PLANNED)
  const actualEnv = parseRecipientsEnv(process.env.REPORT_RECIPIENTS_ACTUAL)
  const allEnv = parseRecipientsEnv(process.env.REPORT_RECIPIENTS_ALL)

  if (channel === "planned" && plannedEnv.length) {
    return dedupeValid(plannedEnv)
  }

  if (channel === "actual" && actualEnv.length) {
    return dedupeValid(actualEnv)
  }

  if (channel === "all") {
    if (allEnv.length) {
      return dedupeValid(allEnv)
    }
    if (plannedEnv.length || actualEnv.length) {
      return dedupeValid([...plannedEnv, ...actualEnv])
    }
  }

  const fallback = parseRecipientsEnv(
    process.env.RESEND_EMAIL_TO ?? process.env.EMAIL_FROM ?? ""
  )

  return dedupeValid(fallback)
}
