"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, CheckCircle, Loader2, XCircle } from "lucide-react"
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
}

type Props = {
  onboardingId: number
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

function isUnavailableStatus(status?: ProbationStatus | null) {
  return status === "CANCELLED" || status === "EXPIRED"
}

function isCompleted(data: ApiProbationResponse | null) {
  return Boolean(
    data?.request?.completedAt || data?.request?.status === "COMPLETED"
  )
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

export function ProbationEvaluationPageClient({
  onboardingId,
  employeeName,
}: Props) {
  const { data: session } = useSession()
  const router = useRouter()

  const role = session?.user?.role ?? "USER"

  const canAccessApp = ["ADMIN", "HR", "IT", "READONLY"].includes(role)
  const canManage = ["ADMIN", "HR", "IT"].includes(role)

  const [data, setData] = useState<ApiProbationResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)

  const pendingNavRef = useRef<string | null>(null)

  const apiUrl = `/api/nastupy/${onboardingId}/probation-evaluation`

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

  const locked = Boolean(data?.request?.isLocked)
  const completed = isCompleted(data)
  const revisionOpen = Boolean(revisionMeta.open)
  const unavailable = isUnavailableStatus(data?.request?.status)

  const readOnly =
    saving ||
    !canManage ||
    locked ||
    unavailable ||
    (completed && !revisionOpen)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const res = await fetch(apiUrl, {
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

      setData(json)
      setDirty(false)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepodařilo se načíst data."
      )
    } finally {
      setLoading(false)
    }
  }, [apiUrl])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!dirty) return

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
      event.returnValue = ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [dirty])

  async function handleSave(values: ProbationEvaluationFormValues) {
    if (saving || !canManage || locked || unavailable) return
    if (completed && !revisionOpen) return

    setSaving(true)
    setError(null)
    setSavedMessage(null)

    try {
      const res = await fetch(apiUrl, {
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

      if (!json?.request || !json?.onboarding) {
        await loadData()
      } else {
        setData(json)
      }

      setDirty(false)

      setSavedMessage(
        values.submitMode === "draft"
          ? "Rozpracované vyhodnocení zkušební doby bylo úspěšně uloženo."
          : values.submitMode === "revision"
            ? "Změny ve vyhodnocení zkušební doby byly uloženy. Aktuální PDF bylo znovu odesláno na HR."
            : "Finální vyhodnocení zkušební doby bylo uloženo a předáno HR."
      )
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Vyhodnocení se nepodařilo uložit."
      )
    } finally {
      setSaving(false)
    }
  }

  function handleBackClick(event: React.MouseEvent, href: string) {
    if (!dirty) return

    event.preventDefault()
    pendingNavRef.current = href
    setShowUnsavedDialog(true)
  }

  function confirmLeave() {
    setShowUnsavedDialog(false)
    setDirty(false)

    if (pendingNavRef.current) {
      router.push(pendingNavRef.current)
      pendingNavRef.current = null
    }
  }

  const backHref = "/nastupy"

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex items-center gap-3">
          {canAccessApp && (
            <Link
              href={backHref}
              onClick={(event) => handleBackClick(event, backHref)}
              className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ArrowLeft className="size-4" />
              Zpět na všechny nástupy
            </Link>
          )}

          <span className="text-sm text-muted-foreground">
            Vyhodnocení zkušební doby
          </span>
        </div>

        {savedMessage && !dirty && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">
                Vyhodnocení zkušební doby bylo úspěšně uloženo.
              </p>
              <p className="mt-0.5 text-green-700">{savedMessage}</p>
            </div>
          </div>
        )}

        {completed && !revisionOpen && (
          <div className="flex items-start gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle className="mt-0.5 size-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">
                Vyhodnocení zkušební doby bylo finálně odesláno.
              </p>
              <p className="mt-0.5 text-green-700">
                Formulář byl předán personálnímu oddělení.
              </p>
            </div>
          </div>
        )}

        {completed && revisionOpen && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <p className="font-medium">Formulář je otevřený k úpravě.</p>
            <p className="mt-1 text-xs">
              Upravte potřebné údaje a použijte tlačítko „Uložit změny“. Po
              uložení se formulář znovu uzavře a aktuální PDF se odešle HR.
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

        {data?.request && employeeMeta && !loading && !error && (
          <ProbationEvaluationForm
            mode="internal"
            formType={data.request.formType}
            employeeMeta={employeeMeta}
            initialData={data.request.data}
            evaluatorName={
              data.request.supervisorName ??
              data.request.evaluatorName ??
              data.currentUser?.name ??
              null
            }
            evaluatorEmail={
              data.request.supervisorEmail ??
              data.request.evaluatorEmail ??
              data.currentUser?.email ??
              null
            }
            currentUserName={data.currentUser?.name ?? null}
            currentUserEmail={data.currentUser?.email ?? null}
            revisionMode={completed && revisionOpen}
            readOnly={readOnly}
            onDirtyChange={setDirty}
            onSubmitInternal={handleSave}
          />
        )}
      </div>

      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
            <AlertDialogDescription>
              Ve vyhodnocení zkušební doby jsou neuložené změny. Pokud odejdete,
              přijdete o ně.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Zůstat</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmLeave}
            >
              Odejít bez uložení
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
