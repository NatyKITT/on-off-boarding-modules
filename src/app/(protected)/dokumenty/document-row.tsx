"use client"

import * as React from "react"
import {
  Clock,
  Download,
  Eye,
  History as HistoryIcon,
  Loader2,
  Mail,
  MailPlus,
} from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import { documentEventActionLabel } from "@/lib/employment-documents"
import { exitChecklistEventActionLabel } from "@/lib/exit-checklist-event-labels"
import { probationEvaluationEventActionLabel } from "@/lib/probation-evaluation-event-labels"
import { cn } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { DocumentHistoryDialog } from "@/components/history/document-history-dialog"

import type { DocumentSummary } from "./types"

function badgeVariant(status: DocumentSummary["status"]) {
  if (status === "completed") return "default" as const
  if (status === "draft") return "outline" as const
  return "outline" as const
}

export function getDownloadUrl(doc: DocumentSummary): string | null {
  switch (doc.kind) {
    case "onboarding_document":
      return doc.status === "completed" && doc.documentId
        ? `/api/dokumenty/internal/${doc.documentId}/pdf`
        : null
    case "probation_evaluation":
      return doc.status === "completed"
        ? `/api/nastupy/${doc.recordId}/probation-evaluation/pdf`
        : null
    case "exit_checklist":
      return doc.status !== "not_created"
        ? `/api/odchody/${doc.recordId}/vystupni-list`
        : null
    default:
      return null
  }
}

export function getSendConfig(doc: DocumentSummary): {
  url: string
  buildBody: (email: string) => unknown
  label: string
} | null {
  switch (doc.kind) {
    case "onboarding_document":
      if (doc.status === "completed" && doc.documentId) {
        return {
          url: "/api/dokumenty/send-pdf",
          label: "Poslat PDF",
          buildBody: (email) => ({
            onboardingId: doc.recordId,
            email,
            documentIds: [doc.documentId],
          }),
        }
      }

      if (doc.status === "draft" && doc.documentId) {
        return {
          url: "/api/dokumenty/send-link",
          label: "Poslat odkaz",
          buildBody: (email) => ({
            onboardingId: doc.recordId,
            email,
            documents: [{ id: doc.documentId, type: doc.documentType }],
          }),
        }
      }

      return null
    case "probation_evaluation":
      return doc.status === "completed"
        ? {
            url: `/api/nastupy/${doc.recordId}/probation-evaluation/send-pdf`,
            label: "Poslat PDF",
            buildBody: (email) => ({ to: email }),
          }
        : null
    case "exit_checklist":
      return doc.status !== "not_created"
        ? {
            url: `/api/odchody/${doc.recordId}/exit-checklist/send-pdf`,
            label: "Poslat PDF",
            buildBody: (email) => ({ to: email }),
          }
        : null
    default:
      return null
  }
}

function getHistoryFetchUrl(doc: DocumentSummary): string | null {
  if (doc.kind === "onboarding_document" && doc.documentId) {
    return `/api/dokumenty/internal/${doc.documentId}/history`
  }

  if (doc.kind === "exit_checklist" && doc.status !== "not_created") {
    return `/api/odchody/${doc.recordId}/exit-checklist/history`
  }

  if (doc.kind === "probation_evaluation") {
    return `/api/nastupy/${doc.recordId}/probation-evaluation/history`
  }

  return null
}

function getActionLabel(kind: DocumentSummary["kind"]) {
  if (kind === "exit_checklist") return exitChecklistEventActionLabel
  if (kind === "probation_evaluation")
    return probationEvaluationEventActionLabel
  return documentEventActionLabel
}

function DocumentPreviewDialog({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = React.useState(false)
  const [loaded, setLoaded] = React.useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setLoaded(false)
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Eye className="size-3.5 shrink-0" />
          Náhled
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex h-[90svh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b p-4">
          <DialogTitle className="flex items-center gap-2">
            <Eye className="size-5 shrink-0" />
            {label}
          </DialogTitle>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 bg-muted/30">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              Načítám náhled…
            </div>
          )}
          {open && (
            <iframe
              src={url}
              title={label}
              className="size-full border-0"
              onLoad={() => setLoaded(true)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SendPopover({ doc }: { doc: DocumentSummary }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const { toast } = useToast()

  const config = getSendConfig(doc)
  if (!config) return null

  async function handleSend() {
    if (!config || !email.trim()) return

    setSending(true)

    try {
      const res = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config.buildBody(email.trim())),
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)
        throw new Error(
          response?.message ?? response?.error ?? "Odeslání se nezdařilo."
        )
      }

      toast({
        title: "Odesláno",
        description: `${doc.label} bylo odesláno na ${email.trim()}.`,
      })
      setOpen(false)
      setEmail("")
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-1.5">
          <Mail className="size-3.5 shrink-0" />
          {config.label}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-72" align="start">
        <div className="space-y-2">
          <p className="text-sm font-medium">{config.label}</p>
          <Input
            type="email"
            placeholder="e-mail příjemce"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={sending || !email.trim()}
            onClick={() => void handleSend()}
          >
            {sending ? "Odesílám…" : "Odeslat"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const downloadUrl = getDownloadUrl(doc)
  const historyFetchUrl = getHistoryFetchUrl(doc)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-medium">{doc.label}</span>
          <Badge variant={badgeVariant(doc.status)} className="shrink-0">
            {doc.statusLabel}
          </Badge>
        </div>
        {doc.note && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3 shrink-0" />
            <span className="truncate">{doc.note}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {downloadUrl && (
          <DocumentPreviewDialog url={downloadUrl} label={doc.label} />
        )}

        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "gap-1.5"
            )}
          >
            <Download className="size-3.5 shrink-0" />
            Stáhnout
          </a>
        )}

        <SendPopover doc={doc} />

        {historyFetchUrl && (
          <DocumentHistoryDialog
            title={`Historie – ${doc.label}`}
            fetchUrl={historyFetchUrl}
            actionLabel={getActionLabel(doc.kind)}
            trigger={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="gap-1.5"
              >
                <HistoryIcon className="size-3.5 shrink-0" />
                Historie
              </Button>
            }
          />
        )}
      </div>
    </div>
  )
}

export function PersonBulkActions({
  documents,
  personLabel,
}: {
  documents: DocumentSummary[]
  personLabel: string
}) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const { toast } = useToast()

  const downloadable = documents.filter((doc) => getDownloadUrl(doc))
  const sendable = documents.filter((doc) => getSendConfig(doc))

  if (downloadable.length === 0 && sendable.length === 0) return null

  function handleDownloadAll() {
    for (const doc of downloadable) {
      const url = getDownloadUrl(doc)
      if (!url) continue
      const link = document.createElement("a")
      link.href = url
      link.target = "_blank"
      link.rel = "noreferrer"
      link.click()
    }
  }

  async function handleSendAll() {
    if (!email.trim()) return
    setSending(true)

    const results = await Promise.allSettled(
      sendable.map(async (doc) => {
        const config = getSendConfig(doc)
        if (!config) return

        const res = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config.buildBody(email.trim())),
        })

        if (!res.ok) {
          const response = await res.json().catch(() => null)
          throw new Error(
            response?.message ?? response?.error ?? "Odeslání se nezdařilo."
          )
        }
      })
    )

    const succeeded = results.filter((r) => r.status === "fulfilled").length
    const failed = results.length - succeeded

    toast({
      title: failed === 0 ? "Odesláno" : "Odesláno částečně",
      description:
        failed === 0
          ? `Všechny dokumenty (${succeeded}) byly odeslány na ${email.trim()}.`
          : `Odesláno ${succeeded} z ${results.length} dokumentů na ${email.trim()}, ${failed} se nezdařilo.`,
      variant: failed === 0 ? "default" : "destructive",
    })

    setSending(false)
    if (failed === 0) {
      setOpen(false)
      setEmail("")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b pb-2">
      <span className="text-xs text-muted-foreground">
        Hromadně pro {personLabel}:
      </span>

      {downloadable.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5 bg-white text-black hover:bg-neutral-100"
          onClick={handleDownloadAll}
        >
          <Download className="size-3.5 shrink-0" />
          Stáhnout vše ({downloadable.length})
        </Button>
      )}

      {sendable.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 bg-white text-black hover:bg-neutral-100"
            >
              <MailPlus className="size-3.5 shrink-0" />
              Poslat vše ({sendable.length})
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-72" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Poslat všechny dostupné dokumenty ({sendable.length})
              </p>
              <Input
                type="email"
                placeholder="e-mail příjemce"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                className="w-full gap-1.5"
                disabled={sending || !email.trim()}
                onClick={() => void handleSendAll()}
              >
                {sending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Odesílám…
                  </>
                ) : (
                  <>
                    <Mail className="size-3.5" />
                    Odeslat
                  </>
                )}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
