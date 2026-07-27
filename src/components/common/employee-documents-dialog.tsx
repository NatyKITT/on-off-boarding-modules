"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  FileText,
  History as HistoryIcon,
  Lock,
  RotateCw,
  Trash2,
  Unlock,
} from "lucide-react"

import { useCurrentRole } from "@/hooks/use-current-role"
import { useToast } from "@/hooks/use-toast"
import { canEditInternalApp } from "@/lib/rbac"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DocumentHistoryDialog } from "@/components/history/document-history-dialog"

import { ProbationEvaluationSection } from "./probation-evaluation-section"

const DOCUMENT_EVENT_ACTION_LABEL: Record<string, string> = {
  CREATED: "Vytvořeno",
  SENT: "Odkaz odeslán",
  PDF_SENT: "PDF odesláno e-mailem",
  FILLED: "Vyplněno zaměstnancem",
  EDITED: "Upraveno interně",
  LOCKED: "Uzamčeno",
  UNLOCKED: "Odemčeno",
  RESET: "Data vymazána",
  REGENERATED: "Odkaz obnoven",
  PDF_DOWNLOADED: "PDF staženo",
  EMAIL_FAILED: "Odeslání e-mailu selhalo",
}

function documentEventActionLabel(action: string) {
  return DOCUMENT_EVENT_ACTION_LABEL[action] ?? action
}

type EmploymentDocumentLite = {
  id: number
  type: EmploymentDocumentType
  status: DocumentStatus
  createdAt: string
  completedAt: string | null
  fileUrl: string | null
  publicUrl: string | null
  isLocked: boolean
  accessHash: string | null
  lastEditedBy?: string | null
  lastEditedAt?: string | null
}

type EmployeeDocumentsDialogProps = {
  onboardingId: number
  email: string
  employeeName?: string
  supervisorName?: string | null
  supervisorEmail?: string | null
  probationEvaluationSentAt?: string | Date | null
  probationEvaluationSentBy?: string | null
  onSent?: () => void
  readOnly?: boolean
}

type ActiveTab = "onboarding" | "probation"

const ONBOARDING_TYPES: EmploymentDocumentType[] = [
  "AFFIDAVIT",
  "PERSONAL_QUESTIONNAIRE",
  "PAYROLL_INFO",
]

const ALL_TYPES: EmploymentDocumentType[] = [...ONBOARDING_TYPES]

function typeLabel(type: EmploymentDocumentType) {
  switch (type) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "PAYROLL_INFO":
      return "Dotazník pro vedení mzdové agendy"
    default:
      return type
  }
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

function formatDateTime(value?: string | Date | null) {
  if (!value) return null

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return format(date, "d.M.yyyy H:mm", { locale: cs })
}

function wasEditedAfterCompletion(
  completedAt?: string | Date | null,
  lastEditedAt?: string | Date | null
) {
  if (!completedAt || !lastEditedAt) return false

  const completed = new Date(completedAt).getTime()
  const edited = new Date(lastEditedAt).getTime()

  return edited - completed > 60_000
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClick()
      }}
      className={
        active
          ? "rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm"
          : "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  )
}

type DocumentCardProps = {
  doc: EmploymentDocumentLite
  needsResend: boolean
  sent: boolean
  lockingId: number | null
  regeneratingId: number | null
  resettingId: number | null
  docToReset: EmploymentDocumentLite | null
  readOnly: boolean
  canViewHistory: boolean
  onOpen: () => void
  onOpenPdf: () => void
  onToggleLock: () => void
  onRegenerate: () => void
  onReset: () => void
}

function DocumentCard({
  doc,
  needsResend,
  sent,
  lockingId,
  regeneratingId,
  resettingId,
  docToReset,
  readOnly,
  canViewHistory,
  onOpen,
  onOpenPdf,
  onToggleLock,
  onRegenerate,
  onReset,
}: DocumentCardProps) {
  const submittedAt = formatDateTime(doc.completedAt)
  const lastEditedAt = formatDateTime(doc.lastEditedAt)
  const edited = wasEditedAfterCompletion(doc.completedAt, doc.lastEditedAt)

  function stopDialogActionEvent(event: React.SyntheticEvent) {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div className="space-y-2 rounded-md border px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <span className="text-sm font-medium">{typeLabel(doc.type)}</span>

          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div>Vytvořeno: {formatDateTime(doc.createdAt) ?? "—"}</div>

            {submittedAt && (
              <div>
                Vyplněno: {submittedAt}
                {!edited && doc.lastEditedBy ? `, ${doc.lastEditedBy}` : ""}
              </div>
            )}

            {edited && lastEditedAt && (
              <div>
                Naposledy upraveno: {lastEditedAt}
                {doc.lastEditedBy ? `, ${doc.lastEditedBy}` : ""}
              </div>
            )}
          </div>
        </div>

        <Badge
          variant={doc.status === "DRAFT" ? "outline" : "default"}
          className="shrink-0"
        >
          {statusLabel(doc.status)}
        </Badge>
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-[76px]"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            stopDialogActionEvent(event)
            onOpen()
          }}
        >
          Otevřít
        </Button>

        {doc.status !== "DRAFT" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-w-[56px]"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              stopDialogActionEvent(event)
              onOpenPdf()
            }}
          >
            PDF
          </Button>
        )}

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={onRegenerate}
          disabled={regeneratingId === doc.id || readOnly}
          title="Vymazat vyplněná data a vygenerovat nový odkaz k vyplnění"
        >
          {regeneratingId === doc.id ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <RotateCw className="size-3" />
          )}
          Nový odkaz
        </Button>

        <Button
          size="icon"
          variant={doc.isLocked ? "default" : "outline"}
          className="size-7"
          onClick={onToggleLock}
          disabled={lockingId === doc.id || readOnly}
          title={doc.isLocked ? "Odemknout" : "Zamknout"}
        >
          {doc.isLocked ? (
            <Lock className="size-3" />
          ) : (
            <Unlock className="size-3" />
          )}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onReset}
          disabled={resettingId === doc.id || readOnly}
          title="Vymazat data (stejný odkaz zůstane platný)"
        >
          {resettingId === doc.id && docToReset?.id === doc.id ? (
            <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </Button>

        {canViewHistory && (
          <DocumentHistoryDialog
            title={`Historie – ${typeLabel(doc.type)}`}
            fetchUrl={`/api/dokumenty/internal/${doc.id}/history`}
            actionLabel={documentEventActionLabel}
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                title="Historie dokumentu"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <HistoryIcon className="size-3.5" />
              </Button>
            }
          />
        )}

        {needsResend && (
          <span className="text-[10px] text-amber-600">
            po změně odešli odkaz znovu
          </span>
        )}

        {sent && !needsResend && (
          <span className="text-[10px] text-emerald-600">odkaz odeslán</span>
        )}
      </div>
    </div>
  )
}

export function EmployeeDocumentsDialog({
  onboardingId,
  email,
  employeeName,
  supervisorName,
  supervisorEmail,
  probationEvaluationSentAt,
  probationEvaluationSentBy,
  onSent,
  readOnly = false,
}: EmployeeDocumentsDialogProps) {
  const [open, setOpen] = useState(false)

  const role = useCurrentRole()
  const canViewHistory = canEditInternalApp(role)

  const [activeTab, setActiveTab] = useState<ActiveTab>("onboarding")

  const [documents, setDocuments] = useState<EmploymentDocumentLite[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [resettingId, setResettingId] = useState<number | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)
  const [lockingId, setLockingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [emailInput, setEmailInput] = useState(email)
  const [emailSelection, setEmailSelection] = useState<
    EmploymentDocumentType[]
  >([])
  const [pdfEmailSelection, setPdfEmailSelection] = useState<
    EmploymentDocumentType[]
  >([])
  const [sendingPdf, setSendingPdf] = useState(false)
  const [pdfSentTypes, setPdfSentTypes] = useState<EmploymentDocumentType[]>([])
  const [sentTypes, setSentTypes] = useState<EmploymentDocumentType[]>([])
  const [needsResendTypes, setNeedsResendTypes] = useState<
    EmploymentDocumentType[]
  >([])
  const [createSelection, setCreateSelection] =
    useState<EmploymentDocumentType[]>(ONBOARDING_TYPES)

  const [docToReset, setDocToReset] = useState<EmploymentDocumentLite | null>(
    null
  )
  const [docToRegenerate, setDocToRegenerate] =
    useState<EmploymentDocumentLite | null>(null)

  const { toast } = useToast()

  const knownDocuments = useMemo(
    () => documents.filter((doc) => ALL_TYPES.includes(doc.type)),
    [documents]
  )

  const onboardingDocuments = useMemo(
    () => knownDocuments.filter((doc) => ONBOARDING_TYPES.includes(doc.type)),
    [knownDocuments]
  )

  const completedOnboardingDocuments = useMemo(
    () => onboardingDocuments.filter((doc) => doc.status !== "DRAFT"),
    [onboardingDocuments]
  )

  const documentsByType = useMemo(() => {
    const map = new Map<EmploymentDocumentType, EmploymentDocumentLite>()

    for (const doc of knownDocuments) {
      map.set(doc.type, doc)
    }

    return map
  }, [knownDocuments])

  const existingTypes = useMemo(
    () => new Set(knownDocuments.map((doc) => doc.type)),
    [knownDocuments]
  )

  function getPublicUrlForDoc(doc: EmploymentDocumentLite): string | null {
    return doc.publicUrl ?? null
  }

  const loadDocuments = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/dokumenty?onboardingId=${onboardingId}`, {
          cache: "no-store",
        })

        if (!res.ok) {
          throw new Error("Nepodařilo se načíst dokumenty.")
        }

        const json = await res.json()
        const list = (json?.documents as EmploymentDocumentLite[]) ?? []

        setDocuments(list)

        return list
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Nepodařilo se načíst dokumenty. Zkuste to prosím znovu."
        )
        setDocuments([])

        return []
      } finally {
        if (!opts?.silent) setLoading(false)
      }
    },
    [onboardingId]
  )

  useEffect(() => {
    if (!open) return

    setActiveTab("onboarding")
    setEmailInput(email)
    setSentTypes([])
    setNeedsResendTypes([])
    setPdfSentTypes([])
    setError(null)

    void (async () => {
      const list = await loadDocuments()
      const defaultSelection = list
        .filter((doc) => ONBOARDING_TYPES.includes(doc.type))
        .filter((doc) => Boolean(getPublicUrlForDoc(doc)))
        .map((doc) => doc.type)

      setEmailSelection(defaultSelection)

      const defaultPdfSelection = list
        .filter((doc) => ONBOARDING_TYPES.includes(doc.type))
        .filter((doc) => doc.status !== "DRAFT")
        .map((doc) => doc.type)

      setPdfEmailSelection(defaultPdfSelection)
    })()
  }, [open, email, loadDocuments])

  async function handleGenerateSelected() {
    const toCreate = createSelection.filter((type) => !existingTypes.has(type))

    if (!toCreate.length) return

    setAssigning(true)
    setError(null)

    try {
      for (const type of toCreate) {
        const res = await fetch("/api/dokumenty/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingId, documentType: type }),
        })

        if (!res.ok) {
          const response = await res.json().catch(() => null)

          throw new Error(
            response?.message ??
              `Vytvoření dokumentu typu ${typeLabel(type)} se nezdařilo.`
          )
        }
      }

      const refreshed = await loadDocuments()
      const defaultSelection = refreshed
        .filter((doc) => ONBOARDING_TYPES.includes(doc.type))
        .filter((doc) => Boolean(getPublicUrlForDoc(doc)))
        .map((doc) => doc.type)

      setEmailSelection(defaultSelection)

      toast({
        title: "Dokumenty vytvořeny",
        description: "Vybrané dokumenty byly úspěšně vygenerovány.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Vytvoření dokumentů se nezdařilo. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při vytváření dokumentů",
        description: message,
        variant: "destructive",
      })
    } finally {
      setAssigning(false)
    }
  }

  async function handleToggleLock(doc: EmploymentDocumentLite) {
    setLockingId(doc.id)
    setError(null)

    try {
      const res = await fetch(`/api/dokumenty/internal/${doc.id}/lock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locked: !doc.isLocked }),
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)

        throw new Error(
          response?.message ?? "Nepodařilo se změnit stav zámku dokumentu."
        )
      }

      const json = (await res.json()) as {
        document: { id: number; isLocked: boolean }
      }

      setDocuments((previous) =>
        previous.map((item) =>
          item.id === json.document.id
            ? { ...item, isLocked: json.document.isLocked }
            : item
        )
      )

      toast({
        title: json.document.isLocked ? "Dokument zamčen" : "Dokument odemčen",
        description: json.document.isLocked
          ? "Dokument nyní nelze upravovat."
          : "Dokument je znovu otevřený k úpravám.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Nepodařilo se změnit stav zámku. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při změně zámku",
        description: message,
        variant: "destructive",
      })
    } finally {
      setLockingId(null)
    }
  }

  async function handleSendEmail() {
    const selectedDocs = onboardingDocuments
      .map((doc) => {
        const url = getPublicUrlForDoc(doc)

        return url && emailSelection.includes(doc.type)
          ? { ...doc, effectiveUrl: url }
          : null
      })
      .filter(Boolean) as (EmploymentDocumentLite & { effectiveUrl: string })[]

    if (!selectedDocs.length || !emailInput) return

    setSending(true)
    setError(null)

    try {
      const res = await fetch("/api/dokumenty/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput,
          employeeName,
          onboardingId,
          documents: selectedDocs.map((doc) => ({
            id: doc.id,
            url: doc.effectiveUrl,
            type: doc.type,
          })),
        }),
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)

        throw new Error(response?.message ?? "Odeslání e-mailu se nezdařilo.")
      }

      const justSentTypes = selectedDocs.map((doc) => doc.type)

      setSentTypes(justSentTypes)
      setNeedsResendTypes((previous) =>
        previous.filter((type) => !justSentTypes.includes(type))
      )

      onSent?.()

      toast({
        title: "E-mail odeslán",
        description: "Zaměstnanci byly odeslány odkazy na vybrané dokumenty.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Odeslání e-mailu se nezdařilo. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při odesílání e-mailu",
        description: message,
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  async function handleSendPdf() {
    const selectedIds = completedOnboardingDocuments
      .filter((doc) => pdfEmailSelection.includes(doc.type))
      .map((doc) => doc.id)

    if (!selectedIds.length || !emailInput) return

    setSendingPdf(true)
    setError(null)

    try {
      const res = await fetch("/api/dokumenty/send-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailInput,
          onboardingId,
          documentIds: selectedIds,
        }),
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)

        throw new Error(response?.message ?? "Odeslání PDF se nezdařilo.")
      }

      setPdfSentTypes(
        completedOnboardingDocuments
          .filter((doc) => selectedIds.includes(doc.id))
          .map((doc) => doc.type)
      )

      toast({
        title: "PDF odesláno",
        description: "Vyplněné dokumenty byly odeslány e-mailem v příloze.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Odeslání PDF se nezdařilo. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při odesílání PDF",
        description: message,
        variant: "destructive",
      })
    } finally {
      setSendingPdf(false)
    }
  }

  async function handleResetDocumentConfirmed(doc: EmploymentDocumentLite) {
    setResettingId(doc.id)
    setError(null)

    try {
      const res = await fetch(`/api/dokumenty/internal/${doc.id}/reset`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)

        throw new Error(response?.message ?? "Reset dokumentu se nezdařil.")
      }

      const updated = (await res.json()) as {
        id: number
        status: DocumentStatus
        completedAt: string | null
        type: EmploymentDocumentType
      }

      setDocuments((previous) =>
        previous.map((docItem) =>
          docItem.id === updated.id
            ? {
                ...docItem,
                status: updated.status,
                completedAt: updated.completedAt,
              }
            : docItem
        )
      )

      setSentTypes((previous) =>
        previous.filter((type) => type !== updated.type)
      )
      setNeedsResendTypes((previous) =>
        previous.includes(updated.type) ? previous : [...previous, updated.type]
      )
      setEmailSelection((previous) =>
        previous.includes(updated.type) ? previous : [...previous, updated.type]
      )

      toast({
        title: "Dokument obnoven",
        description: "Vyplněná data byla smazána. Odkaz zůstává stejný.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Reset dokumentu se nezdařil. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při resetu dokumentu",
        description: message,
        variant: "destructive",
      })
    } finally {
      setResettingId(null)
      setDocToReset(null)
    }
  }

  async function handleRegenerateConfirmed(doc: EmploymentDocumentLite) {
    setRegeneratingId(doc.id)
    setError(null)

    try {
      const res = await fetch(`/api/dokumenty/internal/${doc.id}/regenerate`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
      })

      if (!res.ok) {
        const response = await res.json().catch(() => null)

        throw new Error(response?.message ?? "Obnovení odkazu se nezdařilo.")
      }

      await loadDocuments({ silent: true })

      setSentTypes((previous) => previous.filter((type) => type !== doc.type))
      setNeedsResendTypes((previous) =>
        previous.includes(doc.type) ? previous : [...previous, doc.type]
      )
      setEmailSelection((previous) =>
        previous.includes(doc.type) ? previous : [...previous, doc.type]
      )

      toast({
        title: "Odkaz obnoven",
        description:
          "Byl vygenerován nový odkaz. Nezapomeňte znovu odeslat e-mail.",
      })
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Obnovení odkazu se nezdařilo. Zkuste to prosím znovu."

      setError(message)

      toast({
        title: "Chyba při obnově odkazu",
        description: message,
        variant: "destructive",
      })
    } finally {
      setRegeneratingId(null)
      setDocToRegenerate(null)
    }
  }

  function openDocument(doc: EmploymentDocumentLite) {
    setOpen(false)

    // Plná navigace obchází klientskou router cache Next.js, která by
    // jinak mohla po vyplnění dokumentu zobrazit starou (prázdnou) verzi.
    window.setTimeout(() => {
      window.location.href = `/dokumenty/internal/${doc.id}`
    }, 80)
  }

  function openPdf(doc: EmploymentDocumentLite) {
    window.open(
      `/api/dokumenty/internal/${doc.id}/pdf`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)

    if (!nextOpen) {
      setDocToReset(null)
      setDocToRegenerate(null)
    }
  }

  function handleOpenDocumentsClick(
    event: React.MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        title="Dokumenty k nástupu"
        className="inline-flex items-center justify-center gap-1"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={handleOpenDocumentsClick}
      >
        <FileText className="size-4" />
        <span className="hidden pt-1.5 sm:inline">Dokumenty</span>
      </Button>

      <DialogContent
        className="flex max-h-[95svh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 p-0"
        style={{ overscrollBehavior: "contain" }}
        onInteractOutside={(event) => {
          event.preventDefault()
        }}
      >
        <DialogHeader className="shrink-0 border-b p-4 pr-12 sm:px-6 sm:pr-14">
          <DialogTitle className="leading-snug">
            Dokumenty k nástupu{employeeName ? ` – ${employeeName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Správa nástupních dokumentů a hodnocení zkušební doby.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b bg-muted/40 p-2 sm:px-4">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
            <TabButton
              active={activeTab === "onboarding"}
              onClick={() => setActiveTab("onboarding")}
            >
              Nástupní dokumenty
            </TabButton>

            <TabButton
              active={activeTab === "probation"}
              onClick={() => setActiveTab("probation")}
            >
              Vyhodnocení zkušební doby
            </TabButton>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-lenis-prevent=""
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div className="space-y-5 p-4 sm:px-6">
            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {error}
              </p>
            )}

            {activeTab === "onboarding" && (
              <>
                <section className="space-y-4">
                  <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">Vytvoření dokumentů</div>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void loadDocuments()}
                        disabled={loading}
                        title="Znovu načíst aktuální stav dokumentů (např. pokud byly upraveny jinde)"
                      >
                        Obnovit seznam
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Dokumenty vyplňované při nástupu zaměstnance.
                    </p>

                    <div className="grid gap-2 md:grid-cols-2">
                      {ONBOARDING_TYPES.map((type) => {
                        const exists = existingTypes.has(type)
                        const checked = createSelection.includes(type)

                        return (
                          <label
                            key={type}
                            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs md:text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const isChecked = value === true

                                setCreateSelection((previous) =>
                                  isChecked
                                    ? [...previous, type]
                                    : previous.filter((item) => item !== type)
                                )
                              }}
                            />

                            <span className="flex-1">{typeLabel(type)}</span>

                            {exists && (
                              <span className="text-[10px] text-muted-foreground">
                                již existuje
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => void handleGenerateSelected()}
                      disabled={
                        assigning ||
                        readOnly ||
                        !createSelection.some(
                          (type) =>
                            !existingTypes.has(type) &&
                            ONBOARDING_TYPES.includes(type)
                        )
                      }
                      className="mt-1 flex items-center gap-2"
                    >
                      {assigning && (
                        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      Vygenerovat vybrané dokumenty
                    </Button>
                  </div>
                </section>

                <section className="space-y-2 text-sm">
                  <div className="font-medium">Nástupní dokumenty</div>

                  {loading ? (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      Načítám dokumenty…
                    </div>
                  ) : onboardingDocuments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Zatím nejsou přiřazeny žádné nástupní dokumenty.
                    </p>
                  ) : (
                    <div className="space-y-2 text-sm">
                      {onboardingDocuments.map((doc) => (
                        <DocumentCard
                          key={doc.id}
                          doc={doc}
                          needsResend={needsResendTypes.includes(doc.type)}
                          sent={sentTypes.includes(doc.type)}
                          lockingId={lockingId}
                          regeneratingId={regeneratingId}
                          resettingId={resettingId}
                          docToReset={docToReset}
                          readOnly={readOnly}
                          canViewHistory={canViewHistory}
                          onOpen={() => openDocument(doc)}
                          onOpenPdf={() => openPdf(doc)}
                          onToggleLock={() => void handleToggleLock(doc)}
                          onRegenerate={() => setDocToRegenerate(doc)}
                          onReset={() => setDocToReset(doc)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                  <div className="font-medium">
                    Odeslat odkaz na vybrané dokumenty e-mailem
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Na níže uvedenou adresu bude odeslán e-mail s odkazy na
                    vybrané nástupní dokumenty.
                  </p>

                  <Input
                    type="email"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
                    placeholder="email zaměstnance"
                  />

                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {ONBOARDING_TYPES.map((type) => {
                      const doc = documentsByType.get(type)

                      if (!doc) return null

                      const publicUrl = getPublicUrlForDoc(doc)

                      if (!publicUrl) return null

                      const checked = emailSelection.includes(type)

                      return (
                        <label
                          key={type}
                          className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs md:text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const isChecked = value === true

                              setEmailSelection((previous) =>
                                isChecked
                                  ? [...previous, type]
                                  : previous.filter((item) => item !== type)
                              )
                            }}
                          />

                          <span className="flex-1">{typeLabel(type)}</span>

                          <span className="text-[10px] text-muted-foreground">
                            {statusLabel(doc.status)}
                          </span>
                        </label>
                      )
                    })}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => void handleSendEmail()}
                    disabled={
                      sending ||
                      readOnly ||
                      !emailInput ||
                      !emailSelection.some((type) => {
                        const doc = documentsByType.get(type)
                        return Boolean(doc && getPublicUrlForDoc(doc))
                      })
                    }
                    className="mt-1 flex items-center gap-2"
                  >
                    {sending && (
                      <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    )}
                    Odeslat e-mail s odkazy
                  </Button>
                </section>

                {completedOnboardingDocuments.length > 0 && (
                  <section className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
                    <div className="font-medium">
                      Odeslat vyplněné PDF e-mailem
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Na níže uvedenou adresu bude odeslán e-mail s vyplněnými
                      dokumenty přiloženými jako PDF.
                    </p>

                    <Input
                      type="email"
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      placeholder="e-mail příjemce"
                    />

                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      {ONBOARDING_TYPES.map((type) => {
                        const doc = documentsByType.get(type)

                        if (!doc || doc.status === "DRAFT") return null

                        const checked = pdfEmailSelection.includes(type)

                        return (
                          <label
                            key={type}
                            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs md:text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                const isChecked = value === true

                                setPdfEmailSelection((previous) =>
                                  isChecked
                                    ? [...previous, type]
                                    : previous.filter((item) => item !== type)
                                )
                              }}
                            />

                            <span className="flex-1">{typeLabel(type)}</span>

                            <span className="text-[10px] text-muted-foreground">
                              {statusLabel(doc.status)}
                            </span>
                          </label>
                        )
                      })}
                    </div>

                    <Button
                      size="sm"
                      onClick={() => void handleSendPdf()}
                      disabled={
                        sendingPdf ||
                        !emailInput ||
                        !pdfEmailSelection.some((type) =>
                          completedOnboardingDocuments.some(
                            (doc) => doc.type === type
                          )
                        )
                      }
                      className="mt-1 flex items-center gap-2"
                    >
                      {sendingPdf && (
                        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      )}
                      Odeslat PDF e-mailem
                    </Button>

                    {pdfSentTypes.length > 0 && (
                      <span className="block text-[10px] text-emerald-600">
                        PDF odesláno
                      </span>
                    )}
                  </section>
                )}
              </>
            )}

            <div className={activeTab === "probation" ? "block" : "hidden"}>
              <ProbationEvaluationSection
                active={activeTab === "probation"}
                onboardingId={onboardingId}
                supervisorName={supervisorName}
                supervisorEmail={supervisorEmail}
                probationEvaluationSentAt={probationEvaluationSentAt}
                probationEvaluationSentBy={probationEvaluationSentBy}
                onSent={onSent}
              />
            </div>
          </div>
        </div>

        <AlertDialog
          open={Boolean(docToReset)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDocToReset(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Vymazat vyplněná data dokumentu?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Vyplněné údaje budou odstraněny a dokument se vrátí do stavu
                „Čeká na vyplnění“.
                <br />
                <strong>
                  Odkaz bude stále platný po dobu 14 dní od zaslání e-mailů s
                  dokumenty.
                </strong>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (docToReset) {
                    void handleResetDocumentConfirmed(docToReset)
                  }
                }}
              >
                Vymazat data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(docToRegenerate)}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDocToRegenerate(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Vymazat data a vygenerovat nový odkaz?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong>
                  Veškerá dosud vyplněná data budou nenávratně smazána
                </strong>{" "}
                a dokument se vrátí do stavu „Čeká na vyplnění“.
                <br />
                Zároveň se vygeneruje <strong>nový odkaz</strong> platný 14 dní.
                Starý odkaz přestane fungovat.{" "}
                <strong>Poté je potřeba e-mail odeslat znovu.</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (docToRegenerate) {
                    void handleRegenerateConfirmed(docToRegenerate)
                  }
                }}
              >
                Vymazat a vygenerovat nový odkaz
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
