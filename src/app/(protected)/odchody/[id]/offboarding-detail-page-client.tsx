"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertTriangle, ArrowLeft, CheckCircle, XCircle } from "lucide-react"

import { useIsReadonly } from "@/hooks/use-current-role"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import {
  OffboardingFormUnified,
  type FormValues,
} from "@/components/forms/offboarding-form"
import { HistoryDialog } from "@/components/history/history-dialog"

type LinkedOnboardingInfo = {
  id: number
  plannedStart: string | null
  actualStart: string | null
  probationEnd: string | null
  positionName: string | null
  exitDuringProbation: boolean
  label: string
  description: string
}

type OffboardingDetail = {
  id: number
  status: "NEW" | "IN_PROGRESS" | "COMPLETED"
  plannedEnd: string
  actualEnd?: string | null
  noticeEnd?: string | null
  noticeMonths?: number | null
  hasCustomDates?: boolean

  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null

  positionNum: string
  positionName: string
  department: string
  unitName: string

  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null

  probationStopDecision?: "STOP" | "KEEP" | null
  probationStopDecisionAt?: string | null
  probationStopDecisionBy?: string | null
  probationStopNote?: string | null

  linkedOnboarding?: LinkedOnboardingInfo | null
}

type SuccessModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

function SuccessModal({
  open,
  onOpenChange,
  title,
  message,
}: SuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-4">
          <CheckCircle className="size-12 text-green-500" />
          <div className="space-y-2">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => onOpenChange(false)}>OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ErrorModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

function ErrorModal({ open, onOpenChange, title, message }: ErrorModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center gap-4">
          <XCircle className="size-12 text-red-500" />
          <div className="space-y-2">
            <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zavřít
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function toInitial(d: OffboardingDetail): Partial<FormValues> {
  return {
    titleBefore: d.titleBefore ?? "",
    name: d.name ?? "",
    surname: d.surname ?? "",
    titleAfter: d.titleAfter ?? "",
    personalNumber: d.personalNumber ?? "",
    positionNum: d.positionNum ?? "",
    positionName: d.positionName ?? "",
    department: d.department ?? "",
    unitName: d.unitName ?? "",
    userEmail: d.userEmail ?? "",
    noticeFiled: d.noticeEnd ? d.noticeEnd.slice(0, 10) : "",
    noticeEnd: d.noticeEnd ? d.noticeEnd.slice(0, 10) : undefined,
    noticeMonths: d.noticeMonths ?? undefined,
    hasCustomDates: d.hasCustomDates ?? false,
    plannedEnd: d.plannedEnd ? d.plannedEnd.slice(0, 10) : "",
    actualEnd: d.actualEnd ? d.actualEnd.slice(0, 10) : "",
    notes: d.notes ?? "",
    status: d.status,
  }
}

function formatDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "–"
  }

  return format(date, "d.M.yyyy", { locale: cs })
}

type Props = {
  data: OffboardingDetail
}

export function OffboardingDetailPageClient({ data }: Props) {
  const router = useRouter()
  const isReadonly = useIsReadonly()
  const [isDeleting, setIsDeleting] = useState(false)

  const [successModal, setSuccessModal] = useState({
    open: false,
    title: "",
    message: "",
  })

  const [errorModal, setErrorModal] = useState({
    open: false,
    title: "",
    message: "",
  })

  const displayDate = data.actualEnd ?? data.plannedEnd
  const isCompleted = Boolean(data.actualEnd)

  const statusLabels: Record<OffboardingDetail["status"], string> = {
    NEW: "Plánovaný",
    IN_PROGRESS: "Zpracovává se",
    COMPLETED: "Odešel/a",
  }

  const fullName = `${data.titleBefore ?? ""} ${data.name} ${data.surname} ${
    data.titleAfter ?? ""
  }`.trim()

  async function handleDelete() {
    const confirmed = window.confirm("Opravdu chcete smazat tento záznam?")
    if (!confirmed) return

    try {
      setIsDeleting(true)

      let res = await fetch(`/api/odchody/${data.id}`, {
        method: "DELETE",
      })

      let json = await res.json().catch(() => null)

      if (res.ok && json?.status === "confirm_required") {
        const linkedName = json.linkedOnboarding?.positionName
          ? ` (${json.linkedOnboarding.positionName})`
          : ""

        const confirmedReactivate = window.confirm(
          `Tento odchod aktuálně pozastavuje zkušební dobu propojeného nástupu${linkedName}. ` +
            "Smazáním záznamu se zkušební doba znovu aktivuje a cron k ní může znovu začít posílat výzvy. Pokračovat ve smazání?"
        )

        if (!confirmedReactivate) {
          setIsDeleting(false)
          return
        }

        res = await fetch(`/api/odchody/${data.id}?confirmReactivate=true`, {
          method: "DELETE",
        })

        json = await res.json().catch(() => null)
      }

      if (!res.ok) {
        throw new Error(json?.message ?? "Chyba při mazání.")
      }

      setSuccessModal({
        open: true,
        title: "Záznam smazán",
        message: "Odchod byl úspěšně smazán.",
      })

      setTimeout(() => {
        router.push("/odchody")
        router.refresh()
      }, 1200)
    } catch (error) {
      setErrorModal({
        open: true,
        title: "Chyba při mazání",
        message:
          error instanceof Error ? error.message : "Smazání se nezdařilo.",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">Detail odchodu</h1>
          <p className="text-muted-foreground">Zaměstnanec: {fullName}</p>
        </div>

        <Link href="/odchody">
          <Button variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            Zpět na přehled
          </Button>
        </Link>
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
              {isCompleted ? "Skutečný odchod" : "Plánovaný odchod"}:
            </strong>{" "}
            {formatDate(displayDate)}
          </p>
          <p className="flex items-center gap-2">
            <strong>Stav:</strong>
            <Badge>{statusLabels[data.status]}</Badge>
          </p>
        </div>

        <div className="space-y-2">
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
            <strong>Poznámka:</strong> {data.notes ?? "–"}
          </p>
        </div>
      </div>

      {data.linkedOnboarding && (
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
              <div className="font-semibold">{data.linkedOnboarding.label}</div>

              <p>{data.linkedOnboarding.description}</p>

              <div className="grid gap-1 text-xs text-amber-900/80 dark:text-amber-100/80 sm:grid-cols-2">
                <p>
                  <strong>Související nástup:</strong>{" "}
                  {data.linkedOnboarding.actualStart
                    ? formatDate(data.linkedOnboarding.actualStart)
                    : formatDate(data.linkedOnboarding.plannedStart)}
                </p>

                <p>
                  <strong>Zkušební doba do:</strong>{" "}
                  {formatDate(data.linkedOnboarding.probationEnd)}
                </p>

                {data.linkedOnboarding.positionName && (
                  <p className="sm:col-span-2">
                    <strong>Pozice při nástupu:</strong>{" "}
                    {data.linkedOnboarding.positionName}
                  </p>
                )}
              </div>

              {data.linkedOnboarding.exitDuringProbation && (
                <>
                  <p className="font-medium">
                    Odchod spadá do zkušební doby. V navázaném nástupu se má
                    zastavit vyhodnocování zkušební doby.
                  </p>

                  <div className="rounded-md border border-amber-300/60 bg-amber-100/50 px-3 py-2 text-xs dark:border-amber-800/60 dark:bg-amber-900/20">
                    <div>
                      <strong>Rozhodnutí o zkušební době:</strong>{" "}
                      {data.probationStopDecision === "STOP"
                        ? "Pozastavena"
                        : data.probationStopDecision === "KEEP"
                          ? "Pokračuje (HR potvrdila nezastavovat)"
                          : "Čeká na rozhodnutí HR"}
                    </div>

                    {data.probationStopDecisionBy && (
                      <div>
                        Rozhodl(a): {data.probationStopDecisionBy}
                        {data.probationStopDecisionAt
                          ? ` (${formatDate(data.probationStopDecisionAt)})`
                          : ""}
                      </div>
                    )}

                    {data.probationStopNote && (
                      <div>Poznámka: {data.probationStopNote}</div>
                    )}

                    <div className="mt-1 text-[11px] italic text-amber-900/70 dark:text-amber-100/70">
                      Změnu rozhodnutí proveďte na detailu navázaného nástupu.
                    </div>
                  </div>
                </>
              )}

              <Link href={`/nastupy/${data.linkedOnboarding.id}`}>
                <Button variant="outline" size="sm" className="mt-1">
                  Otevřít související nástup
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex flex-wrap gap-2">
        <HistoryDialog id={data.id} kind="offboarding" />

        <Link href={`/odchody/${data.id}/vystupni-list`}>
          <Button variant="outline">Výstupní list</Button>
        </Link>

        <Link href={`/odchody/${data.id}/editovat`}>
          <Button variant="outline">Upravit</Button>
        </Link>

        {!isCompleted && (
          <Button
            variant="destructive"
            onClick={() => void handleDelete()}
            disabled={isDeleting || isReadonly}
          >
            {isDeleting ? "Mažu..." : "Smazat"}
          </Button>
        )}
      </div>

      {!isCompleted && (
        <>
          <Separator />
          <div>
            <h2 className="mb-2 text-lg font-semibold">
              Potvrdit skutečný odchod
            </h2>

            <OffboardingFormUnified
              id={data.id}
              initial={toInitial(data)}
              mode="edit"
              editContext="actual"
              onSuccess={() => {
                setSuccessModal({
                  open: true,
                  title: "Změny uloženy",
                  message: "Skutečný odchod byl úspěšně potvrzen.",
                })

                setTimeout(() => {
                  router.push(`/odchody/${data.id}`)
                  router.refresh()
                }, 1200)
              }}
            />
          </div>
        </>
      )}

      <SuccessModal
        open={successModal.open}
        onOpenChange={(open) => setSuccessModal((prev) => ({ ...prev, open }))}
        title={successModal.title}
        message={successModal.message}
      />

      <ErrorModal
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  )
}
