"use client"

import { useRouter } from "next/navigation"
import { Link2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

function formatDate(value?: string | null): string {
  if (!value) return "–"
  const d = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return "–"
  return d.toLocaleDateString("cs-CZ")
}

type LinkedOffboardingSummary = {
  id: number
  exitDate: string | null
  isActualExit: boolean
  leftDuringProbation: boolean
  label: string
  description: string
}

type LinkedOnboardingSummary = {
  id: number
  positionName: string | null
  probationEnd: string | null
  exitDuringProbation: boolean
  label: string
  description: string
}

interface LinkedRecordInfoButtonProps {
  employeeName: string
  offboarding?: LinkedOffboardingSummary | null
  onboarding?: LinkedOnboardingSummary | null
}

/**
 * Purely informational cross-reference between a Nástup and an Odchod
 * linked by personalNumber — never writes data between the two modules.
 */
export function LinkedRecordInfoButton({
  employeeName,
  offboarding,
  onboarding,
}: LinkedRecordInfoButtonProps) {
  const router = useRouter()

  if (!offboarding && !onboarding) return null

  const info = offboarding ?? onboarding!
  const targetHref = offboarding
    ? `/odchody/${offboarding.id}`
    : `/nastupy/${onboarding!.id}`
  const targetLabel = offboarding
    ? "Otevřít související odchod"
    : "Otevřít související nástup"
  const dialogTitle = offboarding ? "Související odchod" : "Související nástup"

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          title={
            offboarding
              ? "Zobrazit související odchod"
              : "Zobrazit související nástup"
          }
          className="inline-flex items-center justify-center gap-1 border-sky-200 text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-900/20"
        >
          <Link2 className="size-4" />
          <span className="sr-only">{dialogTitle}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/20">
              <Link2 className="size-5 text-sky-700 dark:text-sky-400" />
            </div>
            <div>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>
                {employeeName} · pouze informační náhled, propojeno podle
                osobního čísla. Údaje se mezi nástupy a odchody nepřepisují.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="font-semibold">{info.label}</div>
          <p className="text-muted-foreground">{info.description}</p>

          {offboarding && (
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                <strong>Datum odchodu:</strong>{" "}
                {formatDate(offboarding.exitDate)}
              </p>
              <p>
                <strong>Typ odchodu:</strong>{" "}
                {offboarding.isActualExit
                  ? "Skutečný odchod"
                  : "Plánovaný odchod"}
              </p>
              <p>
                <strong>Zkušební doba:</strong>{" "}
                {offboarding.leftDuringProbation
                  ? "Odchod ve zkušební době"
                  : "Mimo zkušební dobu / neurčeno"}
              </p>
            </div>
          )}

          {onboarding && (
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                <strong>Pozice:</strong> {onboarding.positionName ?? "–"}
              </p>
              <p>
                <strong>Konec zkušební doby:</strong>{" "}
                {formatDate(onboarding.probationEnd)}
              </p>
              <p>
                <strong>Zkušební doba:</strong>{" "}
                {onboarding.exitDuringProbation
                  ? "Odchod nastal ve zkušební době"
                  : "Mimo zkušební dobu / neurčeno"}
              </p>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            className="mt-1 w-fit"
            onClick={() => router.push(targetHref)}
          >
            {targetLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
