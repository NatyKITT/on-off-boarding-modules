"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { type Position } from "@/types/position"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { OnboardingFormUnified } from "@/components/forms/onboarding-form"

type OnbRow = {
  id: number
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null

  email?: string | null

  positionNum: string | null
  positionName: string
  department: string
  unitName: string

  plannedStart: string | null
  actualStart?: string | null

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

export default function OnboardingEditPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [positions, setPositions] = React.useState<Position[]>([])
  const [row, setRow] = React.useState<OnbRow | null>(null)

  const editContext: "planned" | "actual" = row?.actualStart
    ? "actual"
    : "planned"

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const [posRes, recRes] = await Promise.all([
          fetch("/api/systematizace", { cache: "no-store" }),
          fetch(`/api/nastupy/${params.id}`, { cache: "no-store" }),
        ])

        const posJson = await posRes.json().catch(() => null)
        const recJson = await recRes.json().catch(() => null)

        if (cancelled) return

        setPositions(normalizePositions(posJson))

        if (recRes.ok && recJson?.status === "success" && recJson.data) {
          setRow(recJson.data as OnbRow)
        } else {
          toast({
            title: "Nenalezeno",
            description: "Záznam nástupu se nepodařilo načíst.",
            variant: "destructive",
          })
          router.replace("/nastupy")
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Chyba",
            description: "Nepodařilo se načíst data.",
            variant: "destructive",
          })
          router.replace("/nastupy")
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
        <h1 className="text-2xl font-bold">Upravit nástup</h1>
        <Button variant="outline" onClick={() => router.push("/nastupy")}>
          Zpět na přehled
        </Button>
      </div>

      <Card className="border-muted shadow-sm">
        <CardContent className="p-6">
          {loading || !row ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : (
            <OnboardingFormUnified
              key={`edit-${row.id}-${editContext}-${positions.length}`}
              positions={positions}
              id={row.id}
              initial={{
                titleBefore: row.titleBefore || undefined,
                name: row.name,
                surname: row.surname,
                titleAfter: row.titleAfter || undefined,

                email: row.email || undefined,

                positionNum: row.positionNum || undefined,
                positionName: row.positionName || undefined,
                department: row.department || undefined,
                unitName: row.unitName || undefined,

                plannedStart: row.plannedStart
                  ? row.plannedStart.slice(0, 10)
                  : undefined,
                actualStart: row.actualStart
                  ? row.actualStart.slice(0, 10)
                  : undefined,

                userName: row.userName || undefined,
                userEmail: row.userEmail || undefined,
                personalNumber: row.personalNumber || undefined,
                notes: row.notes || undefined,
                status: row.status || undefined,
              }}
              mode="edit"
              editContext={editContext}
              onSuccess={() => {
                toast({
                  title: "Uloženo",
                  description: "Změny byly úspěšně uloženy.",
                })
                router.push("/nastupy")
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
          {row.plannedStart
            ? ` · Plánovaný nástup: ${format(new Date(row.plannedStart), "d.M.yyyy")}`
            : null}
          {row.actualStart
            ? ` · Skutečný nástup: ${format(new Date(row.actualStart), "d.M.yyyy")}`
            : null}
        </p>
      )}
    </div>
  )
}
