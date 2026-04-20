"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { ClipboardCheck, Mail, RefreshCw } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type EmploymentDocumentLite = {
  id: number
  type: EmploymentDocumentType
  status: DocumentStatus
  createdAt: string
  completedAt: string | null
  publicUrl: string | null
  isLocked: boolean
}

type Props = {
  onboardingId: number
  supervisorName?: string | null
  supervisorEmail?: string | null
  probationEvaluationSentAt?: string | Date | null
  probationEvaluationSentBy?: string | null
  onSent?: () => void
}

function statusLabel(status: DocumentStatus) {
  switch (status) {
    case "DRAFT":
      return "Čeká na vyplnění"
    case "COMPLETED":
    case "SIGNED":
      return "Vyplněno"
    default:
      return status
  }
}

function safeFormatDate(value?: string | Date | null) {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return format(d, "d.M.yyyy H:mm", { locale: cs })
}

export function ProbationEvaluationSection({
  onboardingId,
  supervisorName,
  supervisorEmail,
  probationEvaluationSentAt,
  probationEvaluationSentBy,
  onSent,
}: Props) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [document, setDocument] = useState<EmploymentDocumentLite | null>(null)

  const lastSentText = useMemo(() => {
    const formatted = safeFormatDate(probationEvaluationSentAt)
    if (!formatted) return null
    return probationEvaluationSentBy
      ? `${formatted} (${probationEvaluationSentBy})`
      : formatted
  }, [probationEvaluationSentAt, probationEvaluationSentBy])

  const loadProbationDocument = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dokumenty?onboardingId=${onboardingId}`, {
        cache: "no-store",
      })

      if (!res.ok) {
        throw new Error("Nepodařilo se načíst dokumenty.")
      }

      const json = await res.json()
      const docs = (json?.documents as EmploymentDocumentLite[]) ?? []
      const found = docs.find((d) => d.type === "PROBATION_EVALUATION") ?? null

      setDocument(found)
      return found
    } catch (error) {
      console.error(error)
      setDocument(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [onboardingId])

  useEffect(() => {
    void loadProbationDocument()
  }, [loadProbationDocument])

  async function ensureDocument() {
    if (document) return document

    const res = await fetch("/api/dokumenty/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        onboardingId,
        documentType: "PROBATION_EVALUATION",
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new Error(
        json?.message ?? "Nepodařilo se vytvořit formulář hodnocení."
      )
    }

    const refreshed = await loadProbationDocument()
    if (!refreshed) {
      throw new Error("Formulář byl vytvořen, ale nepodařilo se ho načíst.")
    }

    return refreshed
  }

  async function handleSend() {
    if (!supervisorEmail) {
      toast({
        title: "Chybí e-mail vedoucího",
        description: "Nejdříve doplňte u nástupu jméno a e-mail vedoucího.",
        variant: "destructive",
      })
      return
    }

    setSending(true)

    try {
      const doc = await ensureDocument()

      if (!doc.publicUrl) {
        throw new Error("Dokument zatím nemá veřejný odkaz k odeslání.")
      }

      const res = await fetch("/api/dokumenty/send-probation-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboardingId,
          email: supervisorEmail,
          supervisorName,
          documentId: doc.id,
          url: doc.publicUrl,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(
          json?.message ??
            "Odeslání odkazu na hodnocení zkušební doby se nezdařilo."
        )
      }

      toast({
        title: "E-mail odeslán",
        description: "Vedoucímu byl odeslán odkaz na formulář hodnocení.",
      })

      onSent?.()
      await loadProbationDocument()
    } catch (error) {
      toast({
        title: "Chyba při odesílání",
        description:
          error instanceof Error ? error.message : "Odeslání se nezdařilo.",
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="space-y-3 rounded-md border border-amber-200 bg-amber-50/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <ClipboardCheck className="size-4" />
          Hodnocení zkušební doby
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadProbationDocument()}
          disabled={loading}
        >
          <RefreshCw className="mr-2 size-3" />
          Obnovit
        </Button>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div>
          <strong>Vedoucí:</strong> {supervisorName || "—"}
        </div>
        <div>
          <strong>E-mail vedoucího:</strong> {supervisorEmail || "—"}
        </div>
        {lastSentText && (
          <div>
            <strong>Naposledy odesláno:</strong> {lastSentText}
          </div>
        )}
      </div>

      {document ? (
        <div className="rounded-md border bg-background px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="font-medium">Formulář hodnocení</div>
              <div className="text-xs text-muted-foreground">
                Vytvořeno:{" "}
                {format(new Date(document.createdAt), "d.M.yyyy H:mm", {
                  locale: cs,
                })}
              </div>
              {document.completedAt && (
                <div className="text-xs text-muted-foreground">
                  Vyplněno:{" "}
                  {format(new Date(document.completedAt), "d.M.yyyy H:mm", {
                    locale: cs,
                  })}
                </div>
              )}
            </div>

            <Badge
              variant={document.status === "DRAFT" ? "outline" : "default"}
            >
              {statusLabel(document.status)}
            </Badge>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Formulář zatím není vytvořen. Při odeslání se vytvoří automaticky.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {document && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              window.open(
                `/dokumenty/internal/${document.id}`,
                "_blank",
                "noopener,noreferrer"
              )
            }}
          >
            Otevřít interně
          </Button>
        )}

        <Button size="sm" onClick={() => void handleSend()} disabled={sending}>
          <Mail className="mr-2 size-4" />
          {sending ? "Odesílám..." : "Odeslat vedoucímu"}
        </Button>
      </div>
    </section>
  )
}
