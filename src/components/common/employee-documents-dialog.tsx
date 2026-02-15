"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { DocumentStatus, EmploymentDocumentType } from "@prisma/client"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { FileText, Lock, RotateCw, Trash2, Unlock } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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
}

type EmployeeDocumentsDialogProps = {
  onboardingId: number
  email: string
  employeeName?: string
  onSent?: () => void
}

const ALL_TYPES: EmploymentDocumentType[] = [
  "AFFIDAVIT",
  "PERSONAL_QUESTIONNAIRE",
  "PAYROLL_INFO",
]

function typeLabel(t: EmploymentDocumentType) {
  switch (t) {
    case "AFFIDAVIT":
      return "Čestné prohlášení"
    case "PERSONAL_QUESTIONNAIRE":
      return "Osobní dotazník"
    case "PAYROLL_INFO":
      return "Dotazník pro vedení mzdové agendy"
    default:
      return t
  }
}

function statusLabel(s: DocumentStatus) {
  switch (s) {
    case "DRAFT":
      return "Čeká na vyplnění"
    case "COMPLETED":
    case "SIGNED":
      return "Vyplněno"
    default:
      return s
  }
}

export function EmployeeDocumentsDialog({
  onboardingId,
  email,
  employeeName,
  onSent,
}: EmployeeDocumentsDialogProps) {
  const [open, setOpen] = useState(false)
  const [documents, setDocuments] = useState<EmploymentDocumentLite[]>([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [resettingId, setResettingId] = useState<number | null>(null)
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lockingId, setLockingId] = useState<number | null>(null)

  const [emailInput, setEmailInput] = useState(email)
  const [emailSelection, setEmailSelection] = useState<
    EmploymentDocumentType[]
  >([])
  const [sentTypes, setSentTypes] = useState<EmploymentDocumentType[]>([])
  const [needsResendTypes, setNeedsResendTypes] = useState<
    EmploymentDocumentType[]
  >([])
  const [createSelection, setCreateSelection] =
    useState<EmploymentDocumentType[]>(ALL_TYPES)

  const [docToReset, setDocToReset] = useState<EmploymentDocumentLite | null>(
    null
  )
  const [docToRegenerate, setDocToRegenerate] =
    useState<EmploymentDocumentLite | null>(null)

  const { toast } = useToast()
  const router = useRouter()
  const knownDocuments = useMemo(
    () => documents.filter((d) => (ALL_TYPES as string[]).includes(d.type)),
    [documents]
  )

  const documentsByType = useMemo(() => {
    const map = new Map<EmploymentDocumentType, EmploymentDocumentLite>()
    for (const d of knownDocuments) map.set(d.type, d)
    return map
  }, [knownDocuments])

  const existingTypes = useMemo(
    () => new Set(knownDocuments.map((d) => d.type)),
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
        if (!res.ok) throw new Error("Nepodařilo se načíst dokumenty.")
        const json = await res.json()

        const list = (json?.documents as EmploymentDocumentLite[]) ?? []
        setDocuments(list)
        return list
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
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

    setEmailInput(email)
    setSentTypes([])
    setNeedsResendTypes([])
    setError(null)
    ;(async () => {
      const list = await loadDocuments()
      const knownList = list.filter((d) =>
        (ALL_TYPES as string[]).includes(d.type)
      )
      const defaultSelection = knownList
        .filter((d) => Boolean(getPublicUrlForDoc(d)))
        .map((d) => d.type)

      setEmailSelection(defaultSelection)
    })()
  }, [open, email, loadDocuments])

  async function handleGenerateSelected() {
    const toCreate = createSelection.filter((t) => !existingTypes.has(t))
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
          const j = await res.json().catch(() => null)
          throw new Error(
            j?.message ??
              `Vytvoření dokumentu typu ${typeLabel(type)} se nezdařilo.`
          )
        }
      }

      await loadDocuments()

      toast({
        title: "Dokumenty vytvořeny",
        description: "Vybrané dokumenty byly úspěšně vygenerovány.",
      })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Vytvoření dokumentů se nezdařilo. Zkuste to prosím znovu."
      setError(msg)
      toast({
        title: "Chyba při vytváření dokumentů",
        description: msg,
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
        const j = await res.json().catch(() => null)
        throw new Error(
          j?.message ?? "Nepodařilo se změnit stav zámku dokumentu."
        )
      }

      const j = (await res.json()) as {
        document: { id: number; isLocked: boolean }
      }
      const updated = j.document

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === updated.id ? { ...d, isLocked: updated.isLocked } : d
        )
      )

      toast({
        title: updated.isLocked ? "Dokument zamčen" : "Dokument odemčen",
        description: updated.isLocked
          ? "Dokument nyní nelze upravovat."
          : "Dokument je znovu otevřený k úpravám.",
      })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Nepodařilo se změnit stav zámku. Zkuste to prosím znovu."
      setError(msg)
      toast({
        title: "Chyba při změně zámku",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setLockingId(null)
    }
  }

  async function handleSendEmail() {
    const selectedDocs = knownDocuments
      .map((d) => {
        const url = getPublicUrlForDoc(d)
        return url && emailSelection.includes(d.type)
          ? { ...d, effectiveUrl: url }
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
          documents: selectedDocs.map((d) => ({
            id: d.id,
            url: d.effectiveUrl,
            type: d.type,
          })),
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Odeslání e-mailu se nezdařilo.")
      }

      const justSentTypes = selectedDocs.map((d) => d.type)
      setSentTypes(justSentTypes)
      setNeedsResendTypes((prev) =>
        prev.filter((t) => !justSentTypes.includes(t))
      )

      if (typeof onSent === "function") onSent()

      toast({
        title: "E-mail odeslán",
        description: "Zaměstnanci byly odeslány odkazy na vybrané dokumenty.",
      })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Odeslání e-mailu se nezdařilo. Zkuste to prosím znovu."
      setError(msg)
      toast({
        title: "Chyba při odesílání e-mailu",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setSending(false)
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
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Reset dokumentu se nezdařil.")
      }

      const updated = (await res.json()) as {
        id: number
        status: DocumentStatus
        completedAt: string | null
        type: EmploymentDocumentType
        isLocked?: boolean
      }

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === updated.id
            ? { ...d, status: updated.status, completedAt: updated.completedAt }
            : d
        )
      )

      setSentTypes((prev) => prev.filter((t) => t !== updated.type))
      setNeedsResendTypes((prev) =>
        prev.includes(updated.type) ? prev : [...prev, updated.type]
      )
      setEmailSelection((prev) =>
        prev.includes(updated.type) ? prev : [...prev, updated.type]
      )

      toast({
        title: "Dokument obnoven",
        description: "Vyplněná data byla smazána. Odkaz zůstává stejný.",
      })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Reset dokumentu se nezdařil. Zkuste to prosím znovu."
      setError(msg)
      toast({
        title: "Chyba při resetu dokumentu",
        description: msg,
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
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Obnovení odkazu se nezdařilo.")
      }

      await loadDocuments({ silent: true })

      setSentTypes((prev) => prev.filter((t) => t !== doc.type))
      setNeedsResendTypes((prev) =>
        prev.includes(doc.type) ? prev : [...prev, doc.type]
      )
      setEmailSelection((prev) =>
        prev.includes(doc.type) ? prev : [...prev, doc.type]
      )

      toast({
        title: "Odkaz obnoven",
        description:
          "Byl vygenerován nový odkaz. Nezapomeňte znovu odeslat e-mail.",
      })
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Obnovení odkazu se nezdařilo. Zkuste to prosím znovu."
      setError(msg)
      toast({
        title: "Chyba při obnově odkazu",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setRegeneratingId(null)
      setDocToRegenerate(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          title="Dokumenty k nástupu"
          className="inline-flex items-center justify-center gap-1"
        >
          <FileText className="size-4" />
          <span className="hidden pt-1.5 sm:inline">Dokumenty</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[80vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>
            Dokumenty k nástupu{employeeName ? ` – ${employeeName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Správa všech dokumentů k nástupu (čestné prohlášení, osobní dotazník
            a dokumenty potřebné pro vedení mzdové agendy).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <section className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">Vytvořit / přiřadit dokumenty</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadDocuments()}
                disabled={loading}
              >
                Obnovit
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Vyberte, které typy dokumentů chcete vytvořit. Pokud některý
              dokument již existuje, nebude znovu vytvořen.
            </p>

            <div className="grid gap-2 md:grid-cols-2">
              {ALL_TYPES.map((type) => {
                const exists = existingTypes.has(type)
                const checked = createSelection.includes(type)
                return (
                  <label
                    key={type}
                    className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-xs md:text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) => {
                        const isChecked = val === true
                        setCreateSelection((prev) =>
                          isChecked
                            ? [...prev, type]
                            : prev.filter((t) => t !== type)
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
                assigning || !createSelection.some((t) => !existingTypes.has(t))
              }
              className="mt-1 flex items-center gap-2"
            >
              {assigning && (
                <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Vygenerovat vybrané dokumenty
            </Button>
          </section>

          <section className="space-y-2 text-sm">
            <div className="font-medium">Přiřazené dokumenty</div>

            {loading ? (
              <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                Načítám dokumenty…
              </div>
            ) : knownDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Zatím nejsou k tomuto nástupu přiřazeny žádné dokumenty.
              </p>
            ) : (
              <div className="max-h-[300px] space-y-2 overflow-auto pr-1 text-sm">
                {knownDocuments.map((doc) => {
                  const statusText = statusLabel(doc.status)
                  const needsResend = needsResendTypes.includes(doc.type)

                  return (
                    <div
                      key={doc.id}
                      className="flex min-w-full flex-col gap-2 rounded-md border px-3 py-2 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="space-y-1">
                        <span className="text-sm font-medium">
                          {typeLabel(doc.type)}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          <div>
                            Vytvořeno:{" "}
                            {format(new Date(doc.createdAt), "d.M.yyyy H:mm", {
                              locale: cs,
                            })}
                          </div>
                          {doc.completedAt && (
                            <div>
                              Vyplněno:{" "}
                              {format(
                                new Date(doc.completedAt),
                                "d.M.yyyy H:mm",
                                { locale: cs }
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1 md:gap-2">
                        <Badge
                          variant={
                            doc.status === "DRAFT" ? "outline" : "default"
                          }
                        >
                          {statusText}
                        </Badge>

                        <Button
                          size="icon"
                          variant={doc.isLocked ? "default" : "outline"}
                          className="size-7"
                          onClick={() => void handleToggleLock(doc)}
                          disabled={lockingId === doc.id}
                          title={
                            doc.isLocked
                              ? "Odemknout pro úpravy"
                              : "Zamknout proti úpravám"
                          }
                        >
                          {doc.isLocked ? (
                            <Lock className="size-3" />
                          ) : (
                            <Unlock className="size-3" />
                          )}
                        </Button>

                        <Button
                          size="icon"
                          variant="outline"
                          className="size-7"
                          onClick={() => setDocToRegenerate(doc)}
                          disabled={regeneratingId === doc.id}
                          title="Obnovit odkaz (vygeneruje nový link)"
                        >
                          {regeneratingId === doc.id ? (
                            <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <RotateCw className="size-3" />
                          )}
                        </Button>

                        {doc.status !== "DRAFT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              window.open(
                                `/api/dokumenty/internal/${doc.id}/pdf`,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                          >
                            PDF
                          </Button>
                        )}

                        {needsResend && (
                          <span className="text-[10px] text-amber-600">
                            po změně odešli odkaz znovu
                          </span>
                        )}

                        {sentTypes.includes(doc.type) && !needsResend && (
                          <span className="text-[10px] text-emerald-600">
                            odkaz odeslán
                          </span>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            router.push(`/dokumenty/internal/${doc.id}`)
                          }
                          title="Otevřít interní formulář (HR)"
                        >
                          Otevřít
                        </Button>

                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setDocToReset(doc)}
                          disabled={resettingId === doc.id}
                          title="Vymazat vyplněná data"
                        >
                          {resettingId === doc.id &&
                          docToReset?.id === doc.id ? (
                            <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-2 rounded-md border bg-muted/40 p-3 text-sm">
            <div className="font-medium">
              Odeslat odkaz na vybrané dokumenty e-mailem
            </div>
            <p className="text-xs text-muted-foreground">
              Na níže uvedenou adresu bude odeslán e-mail s odkazy na vybrané
              dokumenty.
            </p>

            <Input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="email zaměstnance"
            />

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {ALL_TYPES.map((type) => {
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
                      onCheckedChange={(val) => {
                        const isChecked = val === true
                        setEmailSelection((prev) =>
                          isChecked
                            ? [...prev, type]
                            : prev.filter((t) => t !== type)
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
                !emailInput ||
                !emailSelection.some((t) => {
                  const d = documentsByType.get(t)
                  return Boolean(d && getPublicUrlForDoc(d))
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
        </div>

        <AlertDialog
          open={!!docToReset}
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
                  Odkaz bude stále platný po dobu 14 dní od zaslání emailů s
                  dokumenty.
                </strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (docToReset) void handleResetDocumentConfirmed(docToReset)
                }}
              >
                Vymazat data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!docToRegenerate}
          onOpenChange={(isOpen) => {
            if (!isOpen) setDocToRegenerate(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Obnovit odkaz na dokument?</AlertDialogTitle>
              <AlertDialogDescription>
                Vygeneruje se <strong>nový odkaz</strong> (platnost
                prodloužena). Starý odkaz přestane fungovat.{" "}
                <strong>
                  Poté je potřeba zaměstnanci znovu odeslat e-mail.
                </strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Zrušit</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (docToRegenerate)
                    void handleRegenerateConfirmed(docToRegenerate)
                }}
              >
                Obnovit odkaz
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}
