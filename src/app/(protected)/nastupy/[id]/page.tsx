"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { AlertTriangle } from "lucide-react"

import { useToast } from "@/hooks/use-toast"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
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

  const [data, setData] = useState<OnboardingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const res = await fetch(`/api/nastupy/${params.id}`, {
          cache: "no-store",
        })

        if (!res.ok) {
          throw new Error("Záznam se nepodařilo načíst.")
        }

        const json = (await res.json()) as { data: OnboardingDetail }

        if (!cancelled) {
          setData(json.data)
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
  }, [params.id, router, toast])

  async function handleDelete() {
    if (!data) return
    if (!window.confirm("Opravdu chcete smazat tento záznam?")) return

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
            <strong>Poznámka HR:</strong> {data.notes ?? "–"}
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
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? "Mažu..." : "Smazat"}
        </Button>
      </div>

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
