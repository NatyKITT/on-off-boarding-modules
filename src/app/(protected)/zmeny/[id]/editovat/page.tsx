"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { type Position } from "@/types/position"

import { useToast } from "@/hooks/use-toast"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmployeeChangeForm } from "@/components/forms/employee-change-form"

type RawPosition = {
  id?: unknown
  num?: unknown
  name?: unknown
  dept_name?: unknown
  unit_name?: unknown
  supervisorName?: unknown
  supervisorEmail?: unknown
  supervisor_name?: unknown
  supervisor_email?: unknown
}

function normalizePositions(payload: unknown): Position[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []

  const raw = arr.filter(
    (value): value is RawPosition =>
      value != null && typeof value === "object" && "num" in value
  )

  const mapped: Position[] = raw.map((value) => {
    const num = String(value.num as string | number)

    return {
      id: String((value.id as string | number | undefined) ?? num),
      num,
      name: typeof value.name === "string" ? value.name : "",
      dept_name: typeof value.dept_name === "string" ? value.dept_name : "",
      unit_name: typeof value.unit_name === "string" ? value.unit_name : "",
      supervisorName:
        typeof value.supervisorName === "string"
          ? value.supervisorName
          : typeof value.supervisor_name === "string"
            ? value.supervisor_name
            : "",
      supervisorEmail:
        typeof value.supervisorEmail === "string"
          ? value.supervisorEmail
          : typeof value.supervisor_email === "string"
            ? value.supervisor_email
            : "",
    }
  })

  const score = (position: Position) =>
    (position.name ? 1 : 0) +
    (position.dept_name ? 1 : 0) +
    (position.unit_name ? 1 : 0)

  const byNum = new Map<string, Position>()

  for (const position of mapped) {
    const existing = byNum.get(position.num)

    if (!existing || score(position) > score(existing)) {
      byNum.set(position.num, position)
    }
  }

  return Array.from(byNum.values())
}

interface PageProps {
  params: {
    id: string
  }
}

export default function EmployeeChangeEditPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [loadingPositions, setLoadingPositions] = React.useState(false)
  const [positions, setPositions] = React.useState<Position[]>([])
  const [row, setRow] = React.useState<Record<string, unknown> | null>(null)

  const numericId = Number(params.id)
  const isValidId = Number.isFinite(numericId)

  React.useEffect(() => {
    if (!isValidId) {
      toast({
        title: "Neplatné ID",
        description: "Změnu se nepodařilo načíst.",
        variant: "destructive",
      })
      router.replace("/zmeny")
      return
    }

    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        setLoadingPositions(true)

        const [changeRes, positionsRes] = await Promise.all([
          fetch(`/api/zmeny/${numericId}`, { cache: "no-store" }),
          fetch("/api/systemizace", { cache: "no-store" }),
        ])

        const changeJson = await changeRes.json().catch(() => null)
        const positionsJson = await positionsRes.json().catch(() => null)

        if (cancelled) return

        if (!changeRes.ok || changeJson?.status !== "success") {
          toast({
            title: "Nenalezeno",
            description: changeJson?.message ?? "Změna se nepodařila načíst.",
            variant: "destructive",
          })
          router.replace("/zmeny")
          return
        }

        setRow(changeJson.data as Record<string, unknown>)

        if (positionsRes.ok) {
          setPositions(normalizePositions(positionsJson))
        } else {
          setPositions([])
          toast({
            title: "Varování",
            description: "Nepodařilo se načíst seznam pozic.",
            variant: "destructive",
          })
        }
      } catch {
        if (!cancelled) {
          toast({
            title: "Chyba",
            description: "Nepodařilo se načíst data.",
            variant: "destructive",
          })
          router.replace("/zmeny")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadingPositions(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [isValidId, numericId, router, toast])

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Upravit změnu</h1>
          <p className="text-sm text-muted-foreground">
            Úprava zaměstnanecké změny. Změna se do nástupů ani odchodů
            nepropisuje, slouží pouze jako informační vazba podle osobního
            čísla.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            isValidId
              ? router.push(`/zmeny/${numericId}`)
              : router.push("/zmeny")
          }
        >
          Zpět na detail
        </Button>
      </div>

      <Card className="border-muted shadow-sm">
        <CardContent className="p-6">
          {loading || !row ? (
            <p className="text-sm text-muted-foreground">Načítám záznam…</p>
          ) : loadingPositions ? (
            <div className="flex items-center gap-3">
              <div className="size-5 animate-spin rounded-full border-b-2 border-current" />
              <p className="text-sm text-muted-foreground">Načítám pozice…</p>
            </div>
          ) : (
            <EmployeeChangeForm
              key={`edit-${numericId}`}
              positions={positions}
              id={numericId}
              mode="edit"
              initial={row}
              onSuccess={async () => {
                toast({
                  title: "Uloženo",
                  description:
                    "Změna byla úspěšně upravena. Související nástupy a odchody zůstaly beze změny.",
                })

                router.push(`/zmeny/${numericId}`)
                router.refresh()
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
