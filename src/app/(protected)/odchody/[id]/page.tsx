import { notFound } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { absoluteUrl } from "@/lib/utils"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  OffboardingFormUnified,
  type FormValues,
} from "@/components/forms/offboarding-form"
import { HistoryDialog } from "@/components/history/history-dialog"

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
}

interface PageProps {
  params: { id: string }
}

/** Převod detailu z API do tvaru, který chce formulář (Partial<FormValues>) */
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

export default async function OffboardingDetailPage({ params }: PageProps) {
  const res = await fetch(absoluteUrl(`/api/odchody/${params.id}`), {
    cache: "no-store",
  })
  if (!res.ok) return notFound()

  const { data } = (await res.json()) as { data: OffboardingDetail }
  const displayDate = data.actualEnd ?? data.plannedEnd
  const isCompleted = Boolean(data.actualEnd)

  const statusLabels: Record<OffboardingDetail["status"], string> = {
    NEW: "Předpokládaný",
    IN_PROGRESS: "Zpracovává se",
    COMPLETED: "Odešel/a",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Detail odchodu</h1>
        <p className="text-muted-foreground">
          Zaměstnanec:{" "}
          {`${data.titleBefore ?? ""} ${data.name} ${data.surname} ${data.titleAfter ?? ""}`.trim()}
        </p>
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
            {format(new Date(displayDate), "d.M.yyyy", { locale: cs })}
          </p>
          <p className="flex items-center gap-2">
            <strong>Stav:</strong> <Badge>{statusLabels[data.status]}</Badge>
          </p>
        </div>

        <div className="space-y-2">
          {Boolean(data.userEmail) && (
            <p>
              <strong>Firemní účet:</strong> {data.userEmail!}
            </p>
          )}
          {Boolean(data.userName) && (
            <p>
              <strong>Uživatelské jméno:</strong> {data.userName!}
            </p>
          )}
          {Boolean(data.personalNumber) && (
            <p>
              <strong>Osobní číslo:</strong> {data.personalNumber!}
            </p>
          )}
          <p>
            <strong>Poznámka:</strong> {data.notes ?? "–"}
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <HistoryDialog id={Number(params.id)} kind="offboarding" />
        <Button
          variant="outline"
          onClick={() => {
            window.location.href = `/odchody/${params.id}/editovat`
          }}
        >
          Upravit
        </Button>
        {!isCompleted && (
          <Button
            variant="destructive"
            onClick={async () => {
              if (confirm("Opravdu chcete smazat tento záznam?")) {
                const resDel = await fetch(`/api/odchody/${params.id}`, {
                  method: "DELETE",
                })
                if (resDel.ok) {
                  window.location.href = "/odchody"
                } else {
                  alert("Chyba při mazání.")
                }
              }
            }}
          >
            Smazat
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
                window.location.href = `/odchody/${params.id}`
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
