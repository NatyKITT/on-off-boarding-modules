"use client"

import { useRouter } from "next/navigation"
import { Info, Link2 } from "lucide-react"

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

type ProbationDecision = "STOP" | "KEEP" | null

type LinkedOffboardingSummary = {
  id: number
  exitDate: string | null
  isActualExit: boolean
  leftDuringProbation: boolean
  probationStopDecision?: ProbationDecision
  label: string
  description: string
}

type LinkedOnboardingSummary = {
  id: number
  positionName: string | null
  probationEnd: string | null
  actualStart?: string | null
  exitDuringProbation: boolean
  isCancelled?: boolean
  label: string
  description: string
}

interface LinkedRecordInfoButtonProps {
  employeeName: string
  offboarding?: LinkedOffboardingSummary | null
  onboarding?: LinkedOnboardingSummary | null
  probationStopDecision?: ProbationDecision
  sourceCancelled?: boolean
}

function decisionChip(decision: ProbationDecision): {
  toneClass: string
  iconWrapClass: string
  iconClass: string
} {
  if (decision === "STOP") {
    return {
      toneClass:
        "border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20",
      iconWrapClass: "bg-rose-100 dark:bg-rose-900/20",
      iconClass: "text-rose-700 dark:text-rose-400",
    }
  }
  if (decision === "KEEP") {
    return {
      toneClass:
        "border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/20",
      iconWrapClass: "bg-emerald-100 dark:bg-emerald-900/20",
      iconClass: "text-emerald-700 dark:text-emerald-400",
    }
  }
  return {
    toneClass:
      "border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/20",
    iconWrapClass: "bg-amber-100 dark:bg-amber-900/20",
    iconClass: "text-amber-700 dark:text-amber-400",
  }
}

function decisionText(decision: ProbationDecision): string {
  if (decision === "STOP") return "Potvrzeno zastavení hodnocení zkušební doby"
  if (decision === "KEEP") return "Pokračuje (HR se rozhodla nezastavovat)"
  return "Čeká na rozhodnutí HR"
}

const infoChip = {
  toneClass:
    "border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900/20",
  iconWrapClass: "bg-slate-100 dark:bg-slate-800/40",
  iconClass: "text-slate-600 dark:text-slate-400",
}

export function LinkedRecordInfoButton({
  employeeName,
  offboarding,
  onboarding,
  probationStopDecision,
  sourceCancelled,
}: LinkedRecordInfoButtonProps) {
  const router = useRouter()

  if (!offboarding && !onboarding) return null

  const info = offboarding ?? onboarding!
  const dialogTitle = offboarding ? "Související odchod" : "Související nástup"

  const targetStatus = offboarding
    ? offboarding.isActualExit
      ? "actual"
      : "planned"
    : onboarding!.isCancelled
      ? "cancelled"
      : onboarding!.actualStart
        ? "actual"
        : "planned"

  const targetHref = offboarding
    ? `/odchody?highlight=${offboarding.id}&status=${targetStatus}`
    : `/nastupy?highlight=${onboarding!.id}&status=${targetStatus}`
  const targetLabel = offboarding
    ? "Otevřít související odchod"
    : "Otevřít související nástup"

  const isInfoOnly =
    Boolean(sourceCancelled) || Boolean(onboarding?.isCancelled)

  const stopRelevant =
    !isInfoOnly &&
    (offboarding
      ? offboarding.leftDuringProbation
      : Boolean(onboarding?.exitDuringProbation))
  const decision: ProbationDecision = offboarding
    ? (offboarding.probationStopDecision ?? null)
    : (probationStopDecision ?? null)

  const chip = isInfoOnly
    ? infoChip
    : stopRelevant
      ? decisionChip(decision)
      : null
  const shortLabel = isInfoOnly
    ? offboarding
      ? "Evidováno v odchodech"
      : "Neuskutečněné nástupy"
    : offboarding
      ? "Propojené odchody"
      : "Propojené nástupy"
  const Icon = isInfoOnly ? Info : Link2

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
          className={`inline-flex items-center justify-center gap-1 whitespace-nowrap ${
            chip?.toneClass ??
            "border-sky-200 text-sky-700 hover:bg-sky-50 hover:text-sky-800 dark:border-sky-800 dark:text-sky-400 dark:hover:bg-sky-900/20"
          }`}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{shortLabel}</span>
          <span className="sr-only sm:hidden">{dialogTitle}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 items-center justify-center rounded-full ${
                chip?.iconWrapClass ?? "bg-sky-100 dark:bg-sky-900/20"
              }`}
            >
              <Icon
                className={`size-5 ${chip?.iconClass ?? "text-sky-700 dark:text-sky-400"}`}
              />
            </div>
            <div>
              <DialogTitle>{dialogTitle}</DialogTitle>
              <DialogDescription>
                {employeeName} · pouze informační náhled (údaje se nepřepisují).
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          {sourceCancelled && (
            <p className="text-muted-foreground">
              Nástup je označený jako neuskutečněný – níže uvedený{" "}
              {offboarding ? "odchod" : "nástup"} je evidovaný jen podle
              shodného osobního čísla, žádná akce se z toho neodvíjí.
            </p>
          )}

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
              {!isInfoOnly && (
                <>
                  <p>
                    <strong>Zkušební doba:</strong>{" "}
                    {offboarding.leftDuringProbation
                      ? "Odchod ve zkušební době"
                      : "Mimo zkušební dobu / neurčeno"}
                  </p>
                  {offboarding.leftDuringProbation && (
                    <p>
                      <strong>Hodnocení zkušební doby:</strong>{" "}
                      {decisionText(decision)}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {onboarding && (
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <p>
                <strong>Pozice:</strong> {onboarding.positionName ?? "–"}
              </p>
              {!isInfoOnly && (
                <>
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
                  {onboarding.exitDuringProbation && (
                    <p>
                      <strong>Hodnocení zkušební doby:</strong>{" "}
                      {decisionText(decision)}
                    </p>
                  )}
                </>
              )}
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
