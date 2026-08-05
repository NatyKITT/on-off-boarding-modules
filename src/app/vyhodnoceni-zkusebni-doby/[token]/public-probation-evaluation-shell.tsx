"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle, Loader2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  ProbationEvaluationForm,
  type ProbationEvaluationFormValues,
} from "@/components/forms/probation-evaluation-form"
import {
  TajemnikReviewForm,
  type TajemnikReviewSubmitValues,
} from "@/components/forms/tajemnik-review-form"

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
  token: string
  employeeName: string
}

function getErrorMessage(json: ApiProbationResponse | null, fallback: string) {
  return json?.message ?? json?.error ?? fallback
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

function isLocked(data: ApiProbationResponse | null) {
  return Boolean(data?.request?.isLocked)
}

function isCompleted(data: ApiProbationResponse | null) {
  return Boolean(
    data?.request?.completedAt || data?.request?.status === "COMPLETED"
  )
}

function isUnavailableStatus(status?: ProbationStatus | null) {
  return status === "CANCELLED" || status === "EXPIRED"
}

function toEmployeeMeta(
  data: ApiProbationResponse | null,
  employeeName: string
) {
  if (!data?.onboarding) return undefined

  const request = data.request
  const onboarding = data.onboarding

  return {
    fullName: onboarding.fullName || employeeName,
    personalNumber: onboarding.personalNumber ?? null,
    position: onboarding.positionName ?? undefined,
    department: onboarding.department ?? undefined,
    unitName: onboarding.unitName ?? undefined,
    actualStart: onboarding.actualStart ?? onboarding.plannedStart ?? null,
    plannedStart: onboarding.plannedStart ?? null,
    probationEnd: request?.probationEnd ?? onboarding.probationEnd ?? null,

    supervisorName:
      request?.supervisorName ??
      onboarding.supervisorName ??
      request?.evaluatorName ??
      null,

    supervisorEmail:
      request?.supervisorEmail ??
      onboarding.supervisorEmail ??
      request?.evaluatorEmail ??
      null,

    supervisorPosition:
      request?.supervisorPosition ??
      onboarding.supervisorPosition ??
      request?.evaluatorPosition ??
      null,

    supervisorDepartment:
      request?.supervisorDepartment ??
      onboarding.supervisorDepartment ??
      request?.evaluatorDepartment ??
      null,

    supervisorUnitName:
      request?.supervisorUnitName ??
      onboarding.supervisorUnitName ??
      request?.evaluatorUnitName ??
      null,
  }
}

export function PublicProbationEvaluationShell({ token, employeeName }: Props) {
  const searchParams = useSearchParams()
  const loginSuccess = searchParams.get("login") === "success"

  const [data, setData] = useState<ApiProbationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showLoginSuccess, setShowLoginSuccess] = useState(loginSuccess)
  const [sendingPdf, setSendingPdf] = useState(false)
  const [pdfSentMessage, setPdfSentMessage] = useState<string | null>(null)

  const publicApiUrl = `/api/nastupy/public/${encodeURIComponent(token)}`

  const employeeMeta = useMemo(
    () => toEmployeeMeta(data, employeeName),
    [data, employeeName]
  )

  const revisionMeta = useMemo(() => {
    if (data?.request?.revision) {
      return data.request.revision
    }

    return getRevisionMeta(data?.request?.data)
  }, [data?.request?.revision, data?.request?.data])

  const locked = isLocked(data)
  const completed = isCompleted(data)
  const revisionOpen = Boolean(revisionMeta.open)
  const unavailable = isUnavailableStatus(data?.request?.status)

  const canShowEditableForm = Boolean(
    data?.request && employeeMeta && !completed && !unavailable
  )

  const canShowRevisionForm = Boolean(
    data?.request && employeeMeta && completed && revisionOpen && !unavailable
  )

  const tajemnikRequired = Boolean(data?.request?.tajemnikRequired)
  const tajemnikReview = data?.tajemnik?.review ?? null
  const isCurrentUserTajemnik = Boolean(data?.tajemnik?.isCurrentUserTajemnik)

  const canShowTajemnikReview = Boolean(
    data?.request &&
      employeeMeta &&
      completed &&
      tajemnikRequired &&
      !tajemnikReview?.signedAt &&
      !unavailable &&
      isCurrentUserTajemnik
  )

  const submittedAndClosed =
    completed && !revisionOpen && !canShowTajemnikReview

  useEffect(() => {
    let cancelled = false

    void (async () => {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(publicApiUrl, {
          cache: "no-store",
          credentials: "include",
        })

        const json = (await res
          .json()
          .catch(() => null)) as ApiProbationResponse | null

        if (!res.ok) {
          throw new Error(
            getErrorMessage(
              json,
              "Nepodařilo se načíst vyhodnocení zkušební doby."
            )
          )
        }

        if (!json?.request || !json?.onboarding) {
          throw new Error("Chybí data vyhodnocení zkušební doby.")
        }

        if (!cancelled) {
          setData(json)
          setDirty(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Nepodařilo se načíst data."
          )
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
  }, [publicApiUrl])

  useEffect(() => {
    if (!showLoginSuccess) return

    const timeout = window.setTimeout(() => {
      setShowLoginSuccess(false)
    }, 5000)

    return () => window.clearTimeout(timeout)
  }, [showLoginSuccess])

  useEffect(() => {
    if (!dirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [dirty])

  async function handleSubmit(values: ProbationEvaluationFormValues) {
    if (submitting || locked || unavailable) return
    if (completed && !revisionOpen) return

    setSubmitting(true)
    setError(null)
    setSavedMessage(null)

    try {
      const res = await fetch(publicApiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(values),
      })

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(json, "Vyhodnocení se nepodařilo uložit.")
        )
      }

      if (json?.request && json?.onboarding) {
        setData(json)
      }

      setDirty(false)

      const justSavedTajemnikRequired = Boolean(json?.request?.tajemnikRequired)
      const justSavedTajemnikName = json?.tajemnik?.name

      setSavedMessage(
        values.submitMode === "draft"
          ? "Rozpracované vyhodnocení bylo uloženo. K formuláři se můžete vrátit přes stejný odkaz."
          : values.submitMode === "revision"
            ? "Změny ve vyhodnocení zkušební doby byly úspěšně uloženy a předány personálnímu oddělení. Tuto stránku můžete zavřít."
            : justSavedTajemnikRequired
              ? `Vyhodnocení zkušební doby bylo úspěšně vyplněno. Bylo předáno personálnímu oddělení a k odsouhlasení tajemníkovi${justSavedTajemnikName ? ` (${justSavedTajemnikName})` : ""}. Tuto stránku můžete zavřít.`
              : "Vyhodnocení zkušební doby bylo úspěšně vyplněno a předáno personálnímu oddělení. Tuto stránku můžete zavřít."
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vyhodnocení se nepodařilo uložit."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTajemnikSubmit(values: TajemnikReviewSubmitValues) {
    if (submitting || unavailable) return

    setSubmitting(true)
    setError(null)
    setSavedMessage(null)

    try {
      const res = await fetch(publicApiUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          submitMode: "tajemnik",
          tajemnikAgreement: values.tajemnikAgreement,
          tajemnikComment: values.tajemnikComment,
          tajemnikSignature: values.tajemnikSignature,
        }),
      })

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(
          getErrorMessage(json, "Vyjádření se nepodařilo uložit.")
        )
      }

      if (json?.request && json?.onboarding) {
        setData(json)
      }

      setSavedMessage(
        "Vaše vyjádření bylo úspěšně uloženo a předáno personálnímu oddělení. Stránku můžete zavřít, nebo si níže stáhněte PDF se svým podpisem, případně ho pošlete na svůj e-mail."
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vyjádření se nepodařilo uložit."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendPdfToSelf() {
    if (sendingPdf) return

    setSendingPdf(true)
    setPdfSentMessage(null)
    setError(null)

    try {
      const res = await fetch(publicApiUrl, {
        method: "POST",
        credentials: "include",
      })

      const json = (await res
        .json()
        .catch(() => null)) as ApiProbationResponse | null

      if (!res.ok) {
        throw new Error(getErrorMessage(json, "PDF se nepodařilo odeslat."))
      }

      setPdfSentMessage("PDF bylo odesláno na váš e-mail.")
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "PDF se nepodařilo odeslat."
      )
    } finally {
      setSendingPdf(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Vyhodnocení zkušební doby</h1>
        </div>

        {!submittedAndClosed && (
          <div className="rounded-md border bg-white px-4 py-3 text-sm text-muted-foreground">
            Tento formulář slouží k vyhodnocení zkušební doby. Po finálním
            odeslání bude předán personálnímu oddělení.
          </div>
        )}

        {showLoginSuccess && !loading && !error && (
          <div className="flex items-start gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Přihlášení proběhlo úspěšně.</p>
              <p className="mt-0.5 text-emerald-700">
                Byli jste přesměrováni zpět na vyhodnocení zkušební doby.
              </p>
            </div>
          </div>
        )}

        {savedMessage && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">
                {submittedAndClosed ? "Odesláno" : "Uloženo"}
              </p>
              <p className="mt-0.5 text-green-700">{savedMessage}</p>
            </div>
          </div>
        )}

        {submittedAndClosed && !savedMessage && !loading && !error && (
          <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <p className="font-medium">
              Vyhodnocení zkušební doby již bylo odesláno.
            </p>
            <p className="mt-1 text-green-700">
              {tajemnikRequired && !tajemnikReview?.signedAt
                ? `Formulář byl předán personálnímu oddělení a k odsouhlasení tajemníkovi${data?.tajemnik?.name ? ` (${data.tajemnik.name})` : ""}.`
                : "Formulář byl předán personálnímu oddělení."}{" "}
              Tuto stránku můžete zavřít.
            </p>
            <p className="mt-2 text-xs text-green-700">
              V případě potřeby znovu editovat formulář se obraťte na personální
              oddělení.
            </p>
          </div>
        )}

        {completed && revisionOpen && !loading && !error && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-medium">
              Formulář byl personálním oddělením otevřen k úpravě.
            </p>
            <p className="mt-1 text-xs">
              Upravte potřebné údaje a použijte tlačítko „Uložit změny“. Po
              uložení se formulář znovu uzavře.
            </p>
          </div>
        )}

        {unavailable && !loading && !error && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-medium">
              {data?.request?.status === "CANCELLED"
                ? "Hodnocení zkušební doby bylo zastaveno."
                : "Platnost formuláře vypršela."}
            </p>
            <p className="mt-1 text-amber-800">
              {data?.request?.status === "CANCELLED"
                ? "Zaměstnanec v průběhu zkušební doby ukončil pracovní poměr, Personální oddělení proto vyhodnocení zastavilo. Formulář už není potřeba vyplňovat."
                : "Odkaz na vyhodnocení zkušební doby již není platný. V případě potřeby se obraťte na Personální oddělení."}
            </p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
            <span className="text-sm">Načítám vyhodnocení zkušební doby…</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <XCircle className="size-10 text-red-400" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {(canShowEditableForm || canShowRevisionForm) &&
          !submittedAndClosed &&
          data?.request &&
          employeeMeta &&
          !loading &&
          !error && (
            <ProbationEvaluationForm
              mode="public"
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
              revisionMode={canShowRevisionForm}
              readOnly={submitting || locked || unavailable}
              onDirtyChange={setDirty}
              onSubmitPublic={handleSubmit}
            />
          )}

        {canShowTajemnikReview && data?.request && !loading && !error && (
          <TajemnikReviewForm
            summary={{
              workResults: getDataRecord(data.request.data)
                .workResults as string,
              workBehavior: getDataRecord(data.request.data)
                .workBehavior as string,
              socialSkills: getDataRecord(data.request.data)
                .socialSkills as string,
              skillsKnowledgeTraits: getDataRecord(data.request.data)
                .skillsKnowledgeTraits as string,
              recommendation:
                getDataRecord(data.request.data).recommendation === "yes" ||
                getDataRecord(data.request.data).recommendation === "no"
                  ? (getDataRecord(data.request.data).recommendation as
                      | "yes"
                      | "no")
                  : "",
              reason: (getDataRecord(data.request.data).reason ??
                getDataRecord(data.request.data).reasonIfNo ??
                "") as string,
              evaluatorName: data.request.evaluatorName ?? null,
              evaluatorEmail: data.request.evaluatorEmail ?? null,
            }}
            canSubmit={isCurrentUserTajemnik}
            currentUserName={data.currentUser?.name ?? ""}
            currentUserEmail={data.currentUser?.email ?? ""}
            onSubmit={handleTajemnikSubmit}
          />
        )}

        {completed && isCurrentUserTajemnik && !loading && !error && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-white px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              PDF vyhodnocení zkušební doby:
            </span>
            <a
              href={`${publicApiUrl}?format=pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
            >
              Stáhnout PDF
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={sendingPdf}
              onClick={() => void handleSendPdfToSelf()}
            >
              {sendingPdf ? "Odesílám…" : "Poslat PDF na můj e-mail"}
            </Button>
            {pdfSentMessage && (
              <span className="text-xs text-green-700">{pdfSentMessage}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
