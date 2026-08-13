"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertTriangle } from "lucide-react"

import { useIsReadonly } from "@/hooks/use-current-role"
import { useToast } from "@/hooks/use-toast"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  OnboardingFormUnified,
  type ProbationExtension,
} from "@/components/forms/onboarding-form"
import { HistoryDialog } from "@/components/history/history-dialog"

type LinkedOffboardingInfo = {
  id: number
  plannedEnd: string | null
  actualEnd: string | null
  exitDate: string | null
  isActualExit: boolean
  leftDuringProbation: boolean
  probationStopDecision: "STOP" | "KEEP" | null
  probationStopDecisionAt: string | null
  probationStopDecisionBy: string | null
  probationStopNote: string | null
  probationShouldBeStopped: boolean
  rowMuted: boolean
  label: string
  description: string
}

type OnboardingDetail = {
  id: number
  status: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  plannedStart: string
  actualStart?: string | null
  probationEnd?: string | null
  startTime?: string | null
  hasCustomDates?: boolean | null
  probationExtensions?: ProbationExtension[] | null
  probationExtensionSummary?: string | null

  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null

  email?: string | null

  positionNum: string
  positionName: string
  department: string
  unitName: string

  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null

  supervisorName?: string | null
  supervisorEmail?: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null
  mentorName?: string | null
  mentorEmail?: string | null

  linkedOffboarding?: LinkedOffboardingInfo | null
}

interface PageProps {
  params: { id: string }
}

function formatDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "–"
  }

  return format(date, "d.M.yyyy", { locale: cs })
}

export default function OnboardingDetailPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const isReadonly = useIsReadonly()

  const [data, setData] = useState<OnboardingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [decisionBusy, setDecisionBusy] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [decisionDialog, setDecisionDialog] = useState<{
    open: boolean
    decision: "STOP" | "KEEP" | null
    note: string
  }>({ open: false, decision: null, note: "" })

  async function loadDetail() {
    const res = await fetch(`/api/nastupy/${params.id}`, {
      cache: "no-store",
    })

    if (!res.ok) {
      throw new Error("Záznam se nepodařilo načíst.")
    }

    const json = (await res.json()) as { data: OnboardingDetail }

    return json.data
  }

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const record = await loadDetail()

        if (!cancelled) {
          setData(record)
        }
      } catch (error) {
        if (!cancelled) {
          toast({
            title: "Chyba",
            description:
              error instanceof Error
                ? error.message
                : "Nepodařilo se načíst detail nástupu.",
            variant: "destructive",
          })
          router.replace("/nastupy")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, router, toast])

  async function confirmProbationDecisionChange() {
    if (!data?.linkedOffboarding || !decisionDialog.decision) return

    const decision = decisionDialog.decision
    const isReactivating = decision === "KEEP"
    const note = isReactivating ? null : decisionDialog.note.trim() || null

    try {
      setDecisionBusy(true)

      const res = await fetch(`/api/odchody/${data.linkedOffboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          probationStopDecision: decision,
          ...(note !== null ? { probationStopNote: note } : {}),
        }),
      })

      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Změna rozhodnutí se nezdařila.")
      }

      toast({
        title: isReactivating
          ? "Zkušební doba znovu aktivována"
          : "Zkušební doba pozastavena",
        description: isReactivating
          ? "Hodnocení zkušební doby pokračuje v běžném cyklu."
          : "Hodnocení zkušební doby je pozastavené, cron nebude posílat další výzvy.",
      })

      setDecisionDialog({ open: false, decision: null, note: "" })
      const refreshed = await loadDetail()
      setData(refreshed)
    } catch (error) {
      toast({
        title: "Chyba",
        description:
          error instanceof Error
            ? error.message
            : "Změna rozhodnutí se nezdařila.",
        variant: "destructive",
      })
    } finally {
      setDecisionBusy(false)
    }
  }

  async function confirmDelete() {
    if (!data) return

    try {
      setDeleting(true)

      const res = await fetch(`/api/nastupy/${params.id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      toast({
        title: "Smazáno",
        description: "Záznam byl úspěšně smazán.",
      })

      router.push("/nastupy")
      router.refresh()
    } catch (error) {
      toast({
        title: "Chyba při mazání",
        description:
          error instanceof Error ? error.message : "Smazání se nezdařilo.",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Načítám detail nástupu…</p>
      </div>
    )
  }

  const displayDate = data.actualStart ?? data.plannedStart
  const isCompleted = Boolean(data.actualStart)

  const statusLabels: Record<OnboardingDetail["status"], string> = {
    NEW: "Předpokládaný",
    IN_PROGRESS: "Zpracovává se",
    COMPLETED: "Nastoupil/a",
    CANCELLED: "Zrušeno",
  }

  const fullName = `${data.titleBefore ?? ""} ${data.name} ${data.surname} ${
    data.titleAfter ?? ""
  }`.trim()

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Detail nástupu</h1>
        <p className="text-muted-foreground">Zaměstnanec: {fullName}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
        <div className="space-y-2">
          <p>
            <strong>Pozice:</strong> {data.positionName} ({data.positionNum})
          </p>
          <p>
            <strong>Odbor:</strong> {data.department}
          </p>
          <p>
            <strong>Oddělení:</strong> {data.unitName}
          </p>
          <p>
            <strong>
              {isCompleted ? "Skutečný nástup" : "Plánovaný nástup"}:
            </strong>{" "}
            {formatDate(displayDate)}
          </p>
          <p className="flex items-center gap-2">
            <strong>Stav:</strong> <Badge>{statusLabels[data.status]}</Badge>
          </p>
        </div>

        <div className="space-y-2">
          <p>
            <strong>Kontaktní e-mail:</strong> {data.email ?? "–"}
          </p>
          {Boolean(data.userEmail) && (
            <p>
              <strong>Firemní účet:</strong> {data.userEmail}
            </p>
          )}
          {Boolean(data.userName) && (
            <p>
              <strong>Uživatelské jméno:</strong> {data.userName}
            </p>
          )}
          {Boolean(data.personalNumber) && (
            <p>
              <strong>Osobní číslo:</strong> {data.personalNumber}
            </p>
          )}
          <p>
            <strong>Poznámka Personálního oddělení:</strong> {data.notes ?? "–"}
          </p>
        </div>
      </div>

      {data.linkedOffboarding && (
        <div
          className="
            rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm
            text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30
            dark:text-amber-100
          "
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />

            <div className="min-w-0 flex-1 space-y-2">
              <div className="font-semibold">
                {data.linkedOffboarding.label}
              </div>

              <p>{data.linkedOffboarding.description}</p>

              <div className="grid gap-1 text-xs text-amber-900/80 dark:text-amber-100/80 sm:grid-cols-2">
                <p>
                  <strong>Související odchod:</strong>{" "}
                  {formatDate(data.linkedOffboarding.exitDate)}
                </p>

                <p>
                  <strong>Typ odchodu:</strong>{" "}
                  {data.linkedOffboarding.isActualExit
                    ? "Skutečný odchod"
                    : "Plánovaný odchod"}
                </p>

                <p>
                  <strong>Zkušební doba:</strong>{" "}
                  {data.linkedOffboarding.leftDuringProbation
                    ? "Odchod ve zkušební době"
                    : "Mimo zkušební dobu / neurčeno"}
                </p>
              </div>

              {data.linkedOffboarding.probationShouldBeStopped && (
                <p className="font-medium">
                  Hodnocení zkušební doby se má pro tento nástup zastavit a
                  neměly by odcházet navazující e-mailové výzvy.
                </p>
              )}

              {data.linkedOffboarding.leftDuringProbation && (
                <div className="rounded-md border border-amber-300/60 bg-amber-100/50 px-3 py-2 text-xs dark:border-amber-800/60 dark:bg-amber-900/20">
                  <div>
                    <strong>Rozhodnutí o zkušební době:</strong>{" "}
                    {data.linkedOffboarding.probationStopDecision === "STOP"
                      ? "Pozastavena"
                      : data.linkedOffboarding.probationStopDecision === "KEEP"
                        ? "Pokračuje (Personální oddělení potvrdilo nezastavovat)"
                        : "Čeká na rozhodnutí Personálního oddělení"}
                  </div>

                  {data.linkedOffboarding.probationStopDecisionBy && (
                    <div>
                      Rozhodl(a):{" "}
                      {data.linkedOffboarding.probationStopDecisionBy}
                      {data.linkedOffboarding.probationStopDecisionAt
                        ? ` (${formatDate(data.linkedOffboarding.probationStopDecisionAt)})`
                        : ""}
                    </div>
                  )}

                  {data.linkedOffboarding.probationStopNote && (
                    <div>
                      Poznámka: {data.linkedOffboarding.probationStopNote}
                    </div>
                  )}
                </div>
              )}

              {data.linkedOffboarding.leftDuringProbation && (
                <div className="flex flex-wrap gap-2">
                  {data.linkedOffboarding.probationStopDecision === "STOP" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={decisionBusy || isReadonly}
                        onClick={() =>
                          setDecisionDialog({
                            open: true,
                            decision: "KEEP",
                            note: "",
                          })
                        }
                      >
                        Znovu aktivovat zkušební dobu
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(`/nastupy/${params.id}/editovat`)
                        }
                      >
                        Otevřít úpravu nástupu (prodloužit zkušební dobu)
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decisionBusy || isReadonly}
                      onClick={() =>
                        setDecisionDialog({
                          open: true,
                          decision: "STOP",
                          note: "",
                        })
                      }
                    >
                      Pozastavit zkušební dobu
                    </Button>
                  )}
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                onClick={() =>
                  router.push(`/odchody/${data.linkedOffboarding?.id}`)
                }
              >
                Otevřít související odchod
              </Button>
            </div>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap gap-2">
        <HistoryDialog id={Number(params.id)} kind="onboarding" />
        <Button
          variant="outline"
          onClick={() => router.push(`/nastupy/${params.id}/editovat`)}
        >
          Upravit
        </Button>
        <Button
          variant="destructive"
          onClick={() => setDeleteConfirmOpen(true)}
          disabled={deleting || isReadonly}
        >
          {deleting ? "Mažu..." : "Smazat"}
        </Button>
      </div>

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteConfirmOpen(false)
        }}
      >
        <DialogContent
          className="max-w-md"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle>Smazat záznam</DialogTitle>

          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>Opravdu chcete smazat tento záznam?</p>

            {data.linkedOffboarding && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <p className="font-medium text-foreground">
                  {data.linkedOffboarding.label}
                </p>
                <p className="mt-0.5">{data.linkedOffboarding.description}</p>
              </div>
            )}

            <p className="text-xs">
              Záznam zůstane uložený a půjde ho kdykoliv obnovit v sekci
              „Smazané záznamy“.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              disabled={deleting}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="flex items-center gap-2"
            >
              {deleting && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Smazat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={decisionDialog.open}
        onOpenChange={(open) => {
          if (!open && !decisionBusy)
            setDecisionDialog({ open: false, decision: null, note: "" })
        }}
      >
        <DialogContent
          className="max-w-md"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle>
            {decisionDialog.decision === "KEEP"
              ? "Znovu aktivovat zkušební dobu?"
              : "Pozastavit zkušební dobu?"}
          </DialogTitle>

          <div className="space-y-3 py-2 text-sm text-muted-foreground">
            <p>
              {decisionDialog.decision === "KEEP"
                ? "Zkušební doba se znovu aktivuje a hodnocení poběží dál (cron může znovu posílat výzvy k vyplnění). Konec zkušební doby zůstává beze změny."
                : "Zkušební doba se pozastaví – cron nebude posílat žádné další výzvy k vyhodnocení a formulář se uzavře."}
            </p>

            {decisionDialog.decision === "STOP" && (
              <div className="space-y-1">
                <Label htmlFor="probation-stop-note">
                  Poznámka k zastavení (nepovinné)
                </Label>
                <Textarea
                  id="probation-stop-note"
                  value={decisionDialog.note}
                  onChange={(e) =>
                    setDecisionDialog((prev) => ({
                      ...prev,
                      note: e.target.value,
                    }))
                  }
                  rows={3}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setDecisionDialog({ open: false, decision: null, note: "" })
              }
              disabled={decisionBusy}
            >
              Zrušit
            </Button>
            <Button
              onClick={() => void confirmProbationDecisionChange()}
              disabled={decisionBusy}
              className="flex items-center gap-2"
            >
              {decisionBusy && (
                <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              Potvrdit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {!isCompleted && (
        <>
          <Separator />
          <div>
            <h2 className="mb-2 text-lg font-semibold">
              Potvrdit skutečný nástup
            </h2>

            <OnboardingFormUnified
              positions={[]}
              id={data.id}
              mode="edit"
              editContext="actual"
              initial={{
                titleBefore: data.titleBefore ?? undefined,
                name: data.name,
                surname: data.surname,
                titleAfter: data.titleAfter ?? undefined,
                email: data.email ?? undefined,
                positionNum: data.positionNum ?? undefined,
                positionName: data.positionName ?? undefined,
                department: data.department ?? undefined,
                unitName: data.unitName ?? undefined,
                plannedStart: data.plannedStart
                  ? data.plannedStart.slice(0, 10)
                  : undefined,
                actualStart: undefined,
                startTime: data.startTime ?? undefined,
                probationEnd: data.probationEnd
                  ? data.probationEnd.slice(0, 10)
                  : undefined,
                hasCustomDates: data.hasCustomDates ?? undefined,
                probationExtensions: data.probationExtensions ?? undefined,
                userEmail: data.userEmail ?? undefined,
                userName: data.userName ?? undefined,
                personalNumber: data.personalNumber ?? undefined,
                notes: data.notes ?? undefined,
                status: data.status ?? undefined,
                supervisorName: data.supervisorName ?? undefined,
                supervisorEmail: data.supervisorEmail ?? undefined,
                supervisorPosition: data.supervisorPosition ?? undefined,
                supervisorDepartment: data.supervisorDepartment ?? undefined,
                supervisorUnitName: data.supervisorUnitName ?? undefined,
              }}
              onSuccess={() => {
                toast({
                  title: "Uloženo",
                  description: "Skutečný nástup byl potvrzen.",
                })
                router.refresh()
                window.location.href = `/nastupy/${params.id}`
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
