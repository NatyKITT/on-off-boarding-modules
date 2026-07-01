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
}

function normalizePositions(payload: unknown): Position[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []
  const raw = arr.filter(
    (v): v is RawPosition => v != null && typeof v === "object" && "num" in v
  )
  return raw.map((v) => ({
    id: String((v.id as string | number | undefined) ?? v.num),
    num: String(v.num as string | number),
    name: typeof v.name === "string" ? v.name : "",
    dept_name: typeof v.dept_name === "string" ? v.dept_name : "",
    unit_name: typeof v.unit_name === "string" ? v.unit_name : "",
    supervisorName: "",
    supervisorEmail: "",
  }))
}

interface PageProps {
  params: { id: string }
}

export default function EmployeeChangeEditPage({ params }: PageProps) {
  const router = useRouter()
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [loadingPositions, setLoadingPositions] = React.useState(false)
  const [positions, setPositions] = React.useState<Position[]>([])
  const [row, setRow] = React.useState<Record<string, unknown> | null>(null)

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/zmeny/${params.id}`, {
          cache: "no-store",
        })
        const json = await res.json().catch(() => null)

        if (cancelled) return

        const data =
          json?.status === "success" ? json.data : (json?.data ?? json)

        if (res.ok && data) {
          setRow(data as Record<string, unknown>)
          setLoading(false)

          setLoadingPositions(true)
          fetch("/api/systemizace", { cache: "no-store" })
            .then((r) => r.json())
            .then((posJson) => {
              if (!cancelled) setPositions(normalizePositions(posJson))
            })
            .catch(() => {
              if (!cancelled)
                toast({
                  title: "Varování",
                  description: "Nepodařilo se načíst seznam pozic.",
                  variant: "destructive",
                })
            })
            .finally(() => {
              if (!cancelled) setLoadingPositions(false)
            })
        } else {
          toast({
            title: "Nenalezeno",
            description: "Změna se nepodařila načíst.",
            variant: "destructive",
          })
          router.replace("/zmeny")
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
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params.id, router, toast])

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upravit změnu</h1>
        <Button
          variant="outline"
          onClick={() => router.push(`/zmeny/${params.id}`)}
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
              key={`edit-${params.id}`}
              positions={positions}
              id={Number(params.id)}
              mode="edit"
              initial={row}
              onSuccess={async () => {
                toast({
                  title: "Uloženo",
                  description: "Změna byla úspěšně upravena.",
                })
                router.push(`/zmeny/${params.id}`)
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
