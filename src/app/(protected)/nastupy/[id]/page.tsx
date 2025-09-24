import { notFound } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { OnboardingFormUnified } from "@/components/forms/onboarding-form"
import { HistoryDialog } from "@/components/history/history-dialog"

type OnboardingDetail = {
  id: number
  status: "NEW" | "IN_PROGRESS" | "COMPLETED"
  plannedStart: string
  actualStart?: string | null

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
}

interface PageProps {
  params: { id: string }
}

export default async function OnboardingDetailPage({ params }: PageProps) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const res = await fetch(`${base}/api/nastupy/${params.id}`, {
    cache: "no-store",
  })
  if (!res.ok) return notFound()

  const { data } = (await res.json()) as { data: OnboardingDetail }
  const displayDate = data.actualStart ?? data.plannedStart
  const isCompleted = Boolean(data.actualStart)

  const statusLabels: Record<OnboardingDetail["status"], string> = {
    NEW: "Předpokládaný",
    IN_PROGRESS: "Zpracovává se",
    COMPLETED: "Nastoupil/a",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-bold">Detail nástupu</h1>
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
              {isCompleted ? "Skutečný nástup" : "Plánovaný nástup"}:
            </strong>{" "}
            {format(new Date(displayDate), "d.M.yyyy", { locale: cs })}
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
            <strong>Poznámka HR:</strong> {data.notes ?? "–"}
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <HistoryDialog id={Number(params.id)} kind="onboarding" />
        <Button
          variant="outline"
          onClick={() =>
            (window.location.href = `/nastupy/${params.id}/editovat`)
          }
        >
          Upravit
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            if (confirm("Opravdu chcete smazat tento záznam?")) {
              const resDel = await fetch(`/api/nastupy/${params.id}`, {
                method: "DELETE",
              })
              if (resDel.ok) window.location.href = "/nastupy"
              else alert("Chyba při mazání (nelze mazat skutečné nástupy).")
            }
          }}
        >
          Smazat
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
              initial={{
                actualStart: undefined,
                userEmail: data.userEmail ?? undefined,
                userName: data.userName ?? undefined,
                personalNumber: data.personalNumber ?? undefined,
                notes: data.notes ?? undefined,
              }}
              onSuccess={() => (window.location.href = `/nastupy/${params.id}`)}
            />
          </div>
        </>
      )}
    </div>
  )
}
