import * as React from "react"
import { CheckCircle, Loader2, XCircle } from "lucide-react"
import { useSession } from "next-auth/react"

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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import {
  ProbationEvaluationForm,
  type ProbationEvaluationFormValues,
} from "@/components/forms/probation-evaluation-form"

type ProbationFormType = "REGULAR_EMPLOYEE" | "MANAGERIAL"

type ProbationStatus =
  | "DRAFT"
  | "READY"
  | "SENT"
  | "COMPLETED"
  | "CANCELLED"
  | "EXPIRED"

type RevisionMeta = {
  open?: boolean | null
  openedAt?: string | null
  openedByName?: string | null
  openedByEmail?: string | null
  editedAt?: string | null
  editedByName?: string | null
  editedByEmail?: string | null
  count?: number | null
}

type ApiProbationResponse = {
  status?: "success" | "error"
  message?: string
  error?: string
  request?: {
    id: number
    formType: ProbationFormType
    status: ProbationStatus
    token: string
    tokenExpiresAt: string | null
    probationEnd?: string | null
    isLocked?: boolean
    completedAt?: string | null
    data?: unknown
    revision?: RevisionMeta | null
    tajemnikRequired?: boolean

    evaluatorName?: string | null
    evaluatorEmail?: string | null
    evaluatorPosition?: string | null
    evaluatorDepartment?: string | null
    evaluatorUnitName?: string | null

    supervisorName?: string | null
    supervisorEmail?: string | null
    supervisorPosition?: string | null
    supervisorDepartment?: string | null
    supervisorUnitName?: string | null
  }
  onboarding?: {
    id: number
    fullName: string
    personalNumber?: string | null
    positionName: string | null
    department: string | null
    unitName: string | null
    actualStart: string | null
    plannedStart?: string | null
    probationEnd: string | null

    supervisorName?: string | null
    supervisorEmail?: string | null
    supervisorPosition?: string | null
    supervisorDepartment?: string | null
    supervisorUnitName?: string | null
  }
  currentUser?: {
    name: string | null
    email: string | null
  }
  tajemnik?: {
    name: string | null
    email: string | null
    selfIsTajemnik: boolean
    isCurrentUserTajemnik: boolean
    review?: {
      agreement?: "yes" | "no" | null
      comment?: string | null
      signedByName?: string | null
      signedByEmail?: string | null
      signedAt?: string | null
    } | null
  }
}

type Props = {
  onboardingId: number
  employeeName?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: (submitMode: ProbationEvaluationFormValues["submitMode"]) => void
  onClosed?: () => void
}

function getErrorMessage(json: ApiProbationResponse | null, fallback: string) {
  return json?.message ?? json?.error ?? fallback
}

function isUnavailableStatus(status?: ProbationStatus | null) {
  return status === "CANCELLED" || status === "EXPIRED"
}

function getDataRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function getRevisionMeta(value: unknown): RevisionMeta {
  const data = getDataRecord(value)
  const revision = data.revision

  if (!revision || typeof revision !== "object" || Array.isArray(revision)) {
    return {}
  }

  return revision as RevisionMeta
}

function formatDateTime(value?: string | null) {
  if (!value) return "—"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"

  return date.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function toEmployeeMeta(
  data: ApiProbationResponse | null,
  employeeName?: string | null
) {
  if (!data?.onboarding) return undefined

  return {
    fullName: data.onboarding.fullName || employeeName || "",
    personalNumber: data.onboarding.personalNumber ?? null,
    position: data.onboarding.positionName ?? null,
    department: data.onboarding.department ?? null,
    unitName: data.onboarding.unitName ?? null,
    actualStart:
      data.onboarding.actualStart ?? data.onboarding.plannedStart ?? null,
    plannedStart: data.onboarding.plannedStart ?? null,
    probationEnd:
      data.request?.probationEnd ?? data.onboarding.probationEnd ?? null,

    supervisorName:
      data.request?.supervisorName ??
      data.onboarding.supervisorName ??
      data.request?.evaluatorName ??
      null,

    supervisorEmail:
      data.request?.supervisorEmail ??
      data.onboarding.supervisorEmail ??
      data.request?.evaluatorEmail ??
      null,

    supervisorPosition:
      data.request?.supervisorPosition ??
      data.onboarding.supervisorPosition ??
      data.request?.evaluatorPosition ??
      null,

    supervisorDepartment:
      data.request?.supervisorDepartment ??
      data.onboarding.supervisorDepartment ??
      data.request?.evaluatorDepartment ??
      null,

    supervisorUnitName:
      data.request?.supervisorUnitName ??
      data.onboarding.supervisorUnitName ??
      data.request?.evaluatorUnitName ??
      null,
  }
}

export function ProbationEvaluationDialog({
  onboardingId,
  employeeName,
  open,
  onOpenChange,
  onSaved,
  onClosed,
}: Props) {
  const { data: session } = useSession()

  const [data, setData] = React.useState<ApiProbationResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [openingRevision, setOpeningRevision] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null)
  const [dirty, setDirty] = React.useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = React.useState(false)
  const [savingMode, setSavingMode] = React.useState<
    ProbationEvaluationFormValues["submitMode"] | null
  >(null)
  const [tajemnikAgreementEdit, setTajemnikAgreementEdit] = React.useState<
    "yes" | "no" | ""
  >("")
  const [tajemnikCommentEdit, setTajemnikCommentEdit] = React.useState("")

  const role = session?.user?.role ?? "USER"
  const canManage = ["ADMIN", "HR", "IT"].includes(role)

  React.useEffect(() => {
    setTajemnikAgreementEdit(data?.tajemnik?.review?.agreement ?? "")
    setTajemnikCommentEdit(data?.tajemnik?.review?.comment ?? "")
  }, [data])

  const employeeMeta = React.useMemo(
    () => toEmployeeMeta(data, employeeName),
    [data, employeeName]
  )

  const revisionMeta = React.useMemo(() => {
    if (data?.request?.revision) {
      return data.request.revision
    }

    return getRevisionMeta(data?.request?.data)
  }, [data?.request?.revision, data?.request?.data])

  const revisionOpen = Boolean(revisionMeta.open)
  const locked = Boolean(data?.request?.isLocked)
  const unavailable = isUnavailableStatus(data?.request?.status)
  const isCompleted =
    data?.request?.status === "COMPLETED" || Boolean(data?.request?.completedAt)

  const readOnly =
    saving ||
    !canManage ||
    locked ||
    unavailable ||
    (isCompleted && !revisionOpen)

  const canEditTajemnikReview = Boolean(
    canManage &&
      revisionOpen &&
      !saving &&
      data?.request?.tajemnikRequired &&
      data?.tajemnik?.review?.signedAt
  )

  const loadData = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setSaved(false)
    setSavedMessage(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation`,
        {
          cache: "no-store",
          credentials: "include",
        }
      )

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(
            json,
            "Nepodařilo se načíst formulář k vyhodnocení zkušební doby."
          )
        )
      }

      if (!json?.request || !json?.onboarding) {
        throw new Error("Chybí data formuláře k vyhodnocení zkušební doby.")
      }

      setData(json)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepodařilo se načíst data."
      )
    } finally {
      setLoading(false)
    }
  }, [onboardingId])

  React.useEffect(() => {
    if (!open) return

    void loadData()
  }, [open, loadData])

  React.useEffect(() => {
    if (!open) {
      setDirty(false)
      setSaved(false)
      setSavedMessage(null)
      setError(null)
      setConfirmCloseOpen(false)
      setSavingMode(null)
      setData(null)
    }
  }, [open])

  React.useEffect(() => {
    if (!open || !dirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [dirty, open])

  function handleDirtyChange(nextDirty: boolean) {
    setDirty(nextDirty)

    if (nextDirty) {
      setSaved(false)
      setSavedMessage(null)
    }
  }

  async function handleOpenRevision() {
    if (!canManage || locked || unavailable || !isCompleted) return

    setOpeningRevision(true)
    setError(null)
    setSaved(false)
    setSavedMessage(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation/revision`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          credentials: "include",
          body: JSON.stringify({ open: true }),
        }
      )

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(json, "Formulář se nepodařilo otevřít k úpravě.")
        )
      }

      if (json?.request && json?.onboarding) {
        setData(json)
      } else {
        await loadData()
      }

      setSaved(true)
      setSavedMessage(
        "Formulář byl otevřen k úpravě. Zůstáváte v tomto okně, můžete upravit údaje a potom použít tlačítko „Uložit změny“."
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Formulář se nepodařilo otevřít k úpravě."
      )
    } finally {
      setOpeningRevision(false)
    }
  }

  async function handleSave(values: ProbationEvaluationFormValues) {
    if (readOnly) return

    setSaving(true)
    setSavingMode(values.submitMode)
    setError(null)
    setSaved(false)
    setSavedMessage(null)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/probation-evaluation`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(
            canEditTajemnikReview && values.submitMode === "revision"
              ? {
                  ...values,
                  tajemnikAgreement: tajemnikAgreementEdit,
                  tajemnikComment: tajemnikCommentEdit,
                }
              : values
          ),
        }
      )

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(
            json,
            values.submitMode === "draft"
              ? "Rozpracované vyhodnocení se nepodařilo uložit."
              : values.submitMode === "revision"
                ? "Změny ve vyhodnocení se nepodařilo uložit."
                : "Finální vyhodnocení se nepodařilo uložit a odeslat na Personální oddělení."
          )
        )
      }

      if (json?.request && json?.onboarding) {
        setData(json)
      } else {
        await loadData()
      }

      setDirty(false)
      setSaved(true)

      const justSavedTajemnikRequired = Boolean(json?.request?.tajemnikRequired)
      const justSavedTajemnikName = json?.tajemnik?.name

      setSavedMessage(
        values.submitMode === "draft"
          ? "Rozpracované vyhodnocení zkušební doby bylo uloženo. Formulář můžete později znovu otevřít a dokončit."
          : values.submitMode === "revision"
            ? "Změny ve vyhodnocení zkušební doby byly uloženy, zapsány do historie a aktuální PDF bylo znovu odesláno na Personální oddělení."
            : justSavedTajemnikRequired
              ? `Finální vyhodnocení zkušební doby bylo uloženo. Bylo předáno Personálnímu oddělení a k odsouhlasení tajemníkovi${justSavedTajemnikName ? ` ${justSavedTajemnikName}` : ""}.`
              : "Finální vyhodnocení zkušební doby bylo uloženo a předáno Personálnímu oddělení."
      )

      onSaved?.(values.submitMode)
      window.dispatchEvent(new Event("probation-evaluation:saved"))
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : values.submitMode === "draft"
            ? "Rozpracované vyhodnocení se nepodařilo uložit."
            : values.submitMode === "revision"
              ? "Změny ve vyhodnocení se nepodařilo uložit."
              : "Finální vyhodnocení se nepodařilo uložit a odeslat na Personální oddělení."
      )
    } finally {
      setSaving(false)
      setSavingMode(null)
    }
  }

  function getSavingMessage(
    mode: ProbationEvaluationFormValues["submitMode"] | null
  ) {
    if (mode === "draft") {
      return "Ukládám rozpracované vyhodnocení. Formulář zůstane otevřený a budete se k němu moci vrátit."
    }

    if (mode === "revision") {
      return "Ukládám změny a odesílám aktuální PDF na Personální oddělení. Může to chvíli trvat."
    }

    return "Ukládám finální vyhodnocení a odesílám PDF na Personální oddělení. Může to chvíli trvat."
  }

  function requestClose() {
    if (dirty) {
      setConfirmCloseOpen(true)
      return
    }

    onOpenChange(false)
    onClosed?.()
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true)
      return
    }

    requestClose()
  }

  function confirmCloseWithoutSaving() {
    setDirty(false)
    setConfirmCloseOpen(false)
    onOpenChange(false)
    onClosed?.()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className="max-h-[92vh] max-w-5xl overflow-y-auto p-0"
          onInteractOutside={(event) => {
            if (dirty) {
              event.preventDefault()
              setConfirmCloseOpen(true)
            }
          }}
          onEscapeKeyDown={(event) => {
            if (dirty) {
              event.preventDefault()
              setConfirmCloseOpen(true)
            }
          }}
        >
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Vyhodnocení zkušební doby</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 p-6">
            {saving && (
              <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-blue-700" />
                <div>
                  <p className="font-medium">
                    {savingMode === "draft"
                      ? "Ukládám rozpracované vyhodnocení…"
                      : "Ukládám a odesílám…"}
                  </p>
                  <p className="mt-0.5 text-blue-800">
                    {getSavingMessage(savingMode)}
                  </p>
                </div>
              </div>
            )}

            {saved && !dirty && (
              <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
                <div>
                  <p className="font-medium">
                    Formulář k vyhodnocení zkušební doby byl úspěšně uložen.
                  </p>
                  <p className="mt-0.5 text-green-700">
                    {savedMessage ??
                      "Změny byly zaznamenány. Okno můžete zavřít a zůstanete zpět v dokumentech nástupu."}
                  </p>
                </div>
              </div>
            )}

            {isCompleted &&
              canManage &&
              !locked &&
              !unavailable &&
              !revisionOpen &&
              !loading &&
              !error && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">
                    Formulář je již finálně vyplněný.
                  </p>
                  <p className="mt-1 text-xs">
                    Pro provedení opravy ho nejdříve otevřete k úpravě. Změna se
                    zapíše do historie a po uložení se formulář znovu uzavře.
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => void handleOpenRevision()}
                    disabled={openingRevision}
                  >
                    {openingRevision
                      ? "Otevírám k úpravě…"
                      : "Otevřít k úpravě"}
                  </Button>
                </div>
              )}

            {isCompleted && revisionOpen && !loading && !error && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <p className="font-medium">Formulář je otevřený k úpravě.</p>
                <p className="mt-1 text-xs">
                  Po úpravě použijte tlačítko „Uložit změny“. Průběžné uložení v
                  tomto režimu není dostupné.
                  {revisionMeta.openedByName || revisionMeta.openedByEmail
                    ? ` Otevřel(a): ${revisionMeta.openedByName || revisionMeta.openedByEmail}.`
                    : ""}
                  {revisionMeta.openedAt
                    ? ` ${formatDateTime(revisionMeta.openedAt)}.`
                    : ""}
                </p>
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
                <span className="text-sm">
                  Načítám formulář k vyhodnocení zkušební doby…
                </span>
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center gap-3 py-16 text-center">
                <XCircle className="size-10 text-red-400" />
                <p className="text-sm text-red-600">{error}</p>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadData()}
                >
                  Zkusit načíst znovu
                </Button>
              </div>
            )}

            {data?.request && employeeMeta && !loading && !error && (
              <ProbationEvaluationForm
                mode="internal"
                formType={data.request.formType}
                employeeMeta={employeeMeta}
                initialData={data.request.data}
                evaluatorName={
                  data.request.supervisorName ??
                  data.request.evaluatorName ??
                  null
                }
                evaluatorEmail={
                  data.request.supervisorEmail ??
                  data.request.evaluatorEmail ??
                  null
                }
                currentUserName={data.currentUser?.name ?? null}
                currentUserEmail={data.currentUser?.email ?? null}
                revisionMode={revisionOpen}
                readOnly={readOnly}
                onDirtyChange={handleDirtyChange}
                onSubmitInternal={handleSave}
              />
            )}

            {data?.request?.tajemnikRequired && !loading && !error && (
              <div className="rounded-md border bg-muted/20 p-4 text-sm">
                <p className="font-medium">
                  Vyjádření k vyhodnocení zkušební doby
                  {data.tajemnik?.name ? ` – ${data.tajemnik.name}` : ""}
                </p>

                {canEditTajemnikReview ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label className="mb-2 block text-sm font-medium">
                        S doporučením
                      </Label>
                      <RadioGroup
                        value={tajemnikAgreementEdit}
                        onValueChange={(value) =>
                          setTajemnikAgreementEdit(value as "yes" | "no")
                        }
                        className="flex flex-col gap-2"
                        disabled={saving}
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem
                            value="yes"
                            id="tajemnik-edit-agree-yes"
                          />
                          <Label
                            htmlFor="tajemnik-edit-agree-yes"
                            className="font-normal"
                          >
                            Souhlasí
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem
                            value="no"
                            id="tajemnik-edit-agree-no"
                          />
                          <Label
                            htmlFor="tajemnik-edit-agree-no"
                            className="font-normal"
                          >
                            Nesouhlasí
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div>
                      <Label
                        htmlFor="tajemnik-edit-comment"
                        className="mb-2 block text-sm font-medium"
                      >
                        Komentář
                      </Label>
                      <Textarea
                        id="tajemnik-edit-comment"
                        value={tajemnikCommentEdit}
                        onChange={(event) =>
                          setTajemnikCommentEdit(event.target.value)
                        }
                        disabled={saving}
                        className="resize-y"
                      />
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Změna se uloží tlačítkem „Uložit změny“ ve formuláři výše
                      a zapíše se do historie. Podpis tajemníka zůstane
                      zachovaný.
                    </p>
                  </div>
                ) : data.tajemnik?.review?.signedAt ? (
                  <div className="mt-2 space-y-1">
                    <p className="font-medium">
                      {data.tajemnik.review.agreement === "no"
                        ? "Nesouhlasí s doporučením"
                        : "Souhlasí s doporučením"}
                    </p>
                    <p className="break-words text-xs text-muted-foreground">
                      {data.tajemnik.review.signedByName ||
                        data.tajemnik.review.signedByEmail}{" "}
                      · podepsáno{" "}
                      {formatDateTime(data.tajemnik.review.signedAt)}
                    </p>
                    {data.tajemnik.review.comment && (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {data.tajemnik.review.comment}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Čeká na vyjádření tajemníka.
                  </p>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Ve formuláři k vyhodnocení zkušební doby jsou neuložené změny.
              Nejdříve je můžete uložit, nebo odejít bez uložení.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Zůstat ve formuláři</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmCloseWithoutSaving}
            >
              Odejít bez uložení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
