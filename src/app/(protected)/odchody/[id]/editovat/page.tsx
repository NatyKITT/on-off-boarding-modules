"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { type Position } from "@/types/position"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { OffboardingFormUnified } from "@/components/forms/offboarding-form"

type OffRow = {
  id: number
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null

  department: string
  unitName: string

  positionNum: string | null
  positionName: string

  plannedEnd: string
  actualEnd?: string | null

  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

interface PageProps {
  params: { id: string }
}

function normalizePositions(api: unknown): Position[] {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null

  const src: unknown[] = Array.isArray(api)
    ? api
    : isRecord(api) && Array.isArray((api as { data?: unknown }).data)
      ? (api as { data: unknown[] }).data
      : []

  const out: Position[] = []
  for (const it of src) {
    if (
      isRecord(it) &&
      typeof it.num === "string" &&
      typeof it.name === "string"
    ) {
      out.push({
        id: String(
          typeof it.id === "string" || typeof it.id === "number"
            ? it.id
            : it.num
        ),
        num: it.num,
        name: it.name,
        dept_name: typeof it.dept_name === "string" ? it.dept_name : "",
        unit_name: typeof it.unit_name === "string" ? it.unit_name : "",
      })
    }
  }
  return out
}

export default function OffboardingEditPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [positions, setPositions] = React.useState<Position[]>([])
  const [row, setRow] = React.useState<OffRow | null>(null)

  const editContext: "planned" | "actual" = row?.actualEnd
    ? "actual"
    : "planned"

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const [posRes, recRes] = await Promise.all([
          fetch("/api/systematizace", { cache: "no-store" }),
          fetch(`/api/odchody/${params.id}`, { cache: "no-store" }),
        ])

        const posJson = await posRes.json().catch(() => null)
        const recJson = await recRes.json().catch(() => null)

        if (cancelled) return

        setPositions(normalizePositions(posJson))

        if (recRes.ok && recJson?.status === "success" && recJson.data) {
          setRow(recJson.data as OffRow)
        } else {
          toast({
            title: "Nenalezeno",
            description: "Záznam odchodu se nepodařilo načíst.",
            variant: "destructive",
          })
          router.replace("/odchody")
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Chyba",
            description: "Nepodařilo se načíst data.",
            variant: "destructive",
          })
          router.replace("/odchody")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params.id, router, toast])

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upravit odchod</h1>
        <Button variant="outline" onClick={() => router.push("/odchody")}>
          Zpět na přehled
        </Button>
      </div>

      <Card className="border-muted shadow-sm">
        <CardContent className="p-6">
          {loading || !row ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : (
            <OffboardingFormUnified
              key={`edit-${row.id}-${editContext}-${positions.length}`}
              positions={positions}
              id={row.id}
              initial={{
                titleBefore: row.titleBefore ?? "",
                name: row.name,
                surname: row.surname,
                titleAfter: row.titleAfter ?? "",

                userEmail: row.userEmail ?? "",

                positionNum: row.positionNum ?? "",
                positionName: row.positionName ?? "",
                department: row.department ?? "",
                unitName: row.unitName ?? "",

                plannedEnd: row.plannedEnd ? row.plannedEnd.slice(0, 10) : null,
                actualEnd: row.actualEnd ? row.actualEnd.slice(0, 10) : null,

                userName: row.userName ?? "",
                personalNumber: row.personalNumber ?? "",
                notes: row.notes ?? "",
                status: row.status ?? null,
              }}
              defaultCreateMode="edit"
              editContext={editContext}
              submitLabel="Uložit změny"
              onSuccess={() => {
                toast({
                  title: "Uloženo",
                  description: "Změny byly úspěšně uloženy.",
                })
                router.push("/odchody")
              }}
            />
          )}
        </CardContent>
      </Card>

      {!loading && row && (
        <p className="mt-3 text-xs text-muted-foreground">
          Režim:{" "}
          <strong>
            {editContext === "planned" ? "Plánovaný" : "Skutečný"}
          </strong>
          {row.plannedEnd
            ? ` · Plánovaný odchod: ${format(new Date(row.plannedEnd), "d.M.yyyy")}`
            : null}
          {row.actualEnd
            ? ` · Skutečný odchod: ${format(new Date(row.actualEnd), "d.M.yyyy")}`
            : null}
        </p>
      )}
    </div>
  )
}
