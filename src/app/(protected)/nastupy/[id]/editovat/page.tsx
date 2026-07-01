"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"

import { type Position } from "@/types/position"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  OnboardingFormUnified,
  type ProbationExtension,
} from "@/components/forms/onboarding-form"

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
  probationEnd?: string | null
  startTime?: string | null
  hasCustomDates?: boolean | null
  probationExtensions?: ProbationExtension[] | null
  probationExtensionSummary?: string | null

  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"

  supervisorName?: string | null
  supervisorEmail?: string | null
  supervisorPosition?: string | null
  supervisorDepartment?: string | null
  supervisorUnitName?: string | null

  mentorName?: string | null
  mentorEmail?: string | null
}

interface PageProps {
  params: { id: string }
}

function normalizePositions(api: unknown): Position[] {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null

  const source: unknown[] = Array.isArray(api)
    ? api
    : isRecord(api) && Array.isArray(api.data)
      ? api.data
      : []

  const output: Position[] = []

  for (const item of source) {
    if (!isRecord(item)) continue

    const num = typeof item.num === "string" ? item.num : ""
    const name = typeof item.name === "string" ? item.name : ""

    if (!num || !name) continue

    output.push({
      id: String(
        typeof item.id === "string" || typeof item.id === "number"
          ? item.id
          : num
      ),
      num,
      name,
      dept_name: typeof item.dept_name === "string" ? item.dept_name : "",
      unit_name: typeof item.unit_name === "string" ? item.unit_name : "",
      supervisorName:
        typeof item.supervisorName === "string"
          ? item.supervisorName
          : typeof item.supervisor_name === "string"
            ? item.supervisor_name
            : "",
      supervisorEmail:
        typeof item.supervisorEmail === "string"
          ? item.supervisorEmail
          : typeof item.supervisor_email === "string"
            ? item.supervisor_email
            : "",
    })
  }

  return output
}

export default function OnboardingEditPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [loadingPositions, setLoadingPositions] = React.useState(false)
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

        const recRes = await fetch(`/api/nastupy/${params.id}`, {
          cache: "no-store",
        })
        const recJson = await recRes.json().catch(() => null)

        if (cancelled) return

        if (!recRes.ok || recJson?.status !== "success" || !recJson.data) {
          toast({
            title: "Nenalezeno",
            description: "Záznam nástupu se nepodařilo načíst.",
            variant: "destructive",
          })
          router.replace("/nastupy")
          return
        }

        setRow(recJson.data as OnbRow)
        setLoading(false)

        setLoadingPositions(true)
        try {
          const posRes = await fetch("/api/systemizace", {
            cache: "no-store",
          })
          const posJson = await posRes.json().catch(() => null)

          if (!cancelled && posRes.ok) {
            setPositions(normalizePositions(posJson))
          }
        } catch (error) {
          console.error("Failed to load positions:", error)
          if (!cancelled) {
            toast({
              title: "Varování",
              description:
                "Nepodařilo se načíst seznam pozic. Formulář půjde otevřít a zkusí pozice načíst znovu při vyhledávání.",
              variant: "destructive",
            })
          }
        } finally {
          if (!cancelled) setLoadingPositions(false)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error loading record:", error)
          toast({
            title: "Chyba",
            description: "Nepodařilo se načíst data.",
            variant: "destructive",
          })
          router.replace("/nastupy")
        }
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
            <p className="text-sm text-muted-foreground">Načítám záznam…</p>
          ) : (
            <>
              {loadingPositions && (
                <div className="mb-4 flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  <div className="size-4 animate-spin rounded-full border-b-2 border-current" />
                  Načítám seznam pozic…
                </div>
              )}

              <OnboardingFormUnified
                key={`edit-${row.id}-${editContext}`}
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
                  probationEnd: row.probationEnd
                    ? row.probationEnd.slice(0, 10)
                    : undefined,
                  startTime: row.startTime || undefined,
                  hasCustomDates: row.hasCustomDates ?? undefined,
                  probationExtensions: row.probationExtensions ?? undefined,

                  userName: row.userName || undefined,
                  userEmail: row.userEmail || undefined,
                  personalNumber: row.personalNumber || undefined,
                  notes: row.notes || undefined,
                  status: row.status || undefined,

                  supervisorName: row.supervisorName || undefined,
                  supervisorEmail: row.supervisorEmail || undefined,
                  supervisorPosition: row.supervisorPosition || undefined,
                  supervisorDepartment: row.supervisorDepartment || undefined,
                  supervisorUnitName: row.supervisorUnitName || undefined,

                  mentorName: row.mentorName || undefined,
                  mentorEmail: row.mentorEmail || undefined,
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
            </>
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
