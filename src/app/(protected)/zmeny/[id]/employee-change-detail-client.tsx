"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Edit,
  Info,
  Trash2,
  User,
  XCircle,
} from "lucide-react"

import { useIsReadonly } from "@/hooks/use-current-role"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { HistoryDialog } from "@/components/history/history-dialog"

type ChangeData = {
  id: number
  type: "POSITION" | "NAME" | "NAME_AND_POSITION"
  status: "DRAFT" | "APPLIED" | "CANCELLED"
  audience: string | null
  effectiveDate: string

  titleBefore: string | null
  name: string
  surname: string
  titleAfter: string | null
  personalNumber: string | null

  oldTitleBefore: string | null
  newTitleBefore: string | null
  oldName: string | null
  newName: string | null
  oldSurname: string | null
  newSurname: string | null
  oldTitleAfter: string | null
  newTitleAfter: string | null

  oldDepartment: string | null
  newDepartment: string | null
  oldUnitName: string | null
  newUnitName: string | null
  oldPositionName: string | null
  newPositionName: string | null
  oldPositionNum: string | null
  newPositionNum: string | null

  notes: string | null
  emailSentAt: string | null
  appliedAt: string | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null

  onboardingMatchesCount?: number
  offboardingMatchesCount?: number
  linkCandidateCount?: number
  infoOnly?: boolean
}

type ChangeItem = {
  label: string
  oldValue: string | null
  newValue: string | null
}

function fmtDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? "–"
    : format(date, "d.M.yyyy", { locale: cs })
}

function typeLabel(type: ChangeData["type"]) {
  if (type === "NAME") return "Změna jména / titulů"
  if (type === "POSITION") return "Změna pozice / odboru"

  return "Změna jména i pozice"
}

function audienceLabel(audience: string | null) {
  if (audience === "ALL_EMPLOYEES") return "Všichni zaměstnanci"
  if (audience === "ONBOARDING_GROUP") return "Stejná skupina jako nástupy"
  if (audience === "HR_GROUP") return "Jen interní evidence"

  return "–"
}

function value(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : "–"
}

function changed(oldValue?: string | null, newValue?: string | null) {
  return value(oldValue) !== value(newValue)
}

function onlyChanged(items: ChangeItem[]) {
  return items.filter((item) => changed(item.oldValue, item.newValue))
}

function ChangeComparisonCard({
  title,
  description,
  items,
}: {
  title: string
  description: string
  items: ChangeItem[]
}) {
  const changedItems = onlyChanged(items)

  if (changedItems.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            U této oblasti nejsou vyplněné žádné rozdílné hodnoty.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="hidden grid-cols-[180px_1fr_1fr] gap-3 rounded-md bg-muted/60 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Pole</span>
          <span>Původní hodnota</span>
          <span>Nová hodnota</span>
        </div>

        <div className="space-y-2">
          {changedItems.map((item) => (
            <div
              key={item.label}
              className="grid gap-2 rounded-lg border p-3 text-sm md:grid-cols-[180px_1fr_1fr] md:items-center"
            >
              <div className="font-medium text-muted-foreground">
                {item.label}
              </div>

              <div className="rounded-md bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950/30 dark:text-red-200">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide md:hidden">
                  Původní hodnota
                </div>
                <span className="line-through decoration-red-500/70">
                  {value(item.oldValue)}
                </span>
              </div>

              <div className="rounded-md bg-green-50 px-3 py-2 font-medium text-green-900 dark:bg-green-950/30 dark:text-green-200">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide md:hidden">
                  Nová hodnota
                </div>
                {value(item.newValue)}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function EmployeeChangeDetailClient({ data }: { data: ChangeData }) {
  const router = useRouter()
  const isReadonly = useIsReadonly()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorDialog, setErrorDialog] = useState({
    open: false,
    message: "",
  })

  const fullName = [data.titleBefore, data.name, data.surname, data.titleAfter]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  const isNameChange = data.type === "NAME" || data.type === "NAME_AND_POSITION"
  const isPositionChange =
    data.type === "POSITION" || data.type === "NAME_AND_POSITION"

  const onboardingMatchesCount = data.onboardingMatchesCount ?? 0
  const offboardingMatchesCount = data.offboardingMatchesCount ?? 0
  const linkCandidateCount =
    data.linkCandidateCount ?? onboardingMatchesCount + offboardingMatchesCount

  const nameItems = useMemo<ChangeItem[]>(
    () => [
      {
        label: "Titul před jménem",
        oldValue: data.oldTitleBefore,
        newValue: data.newTitleBefore,
      },
      {
        label: "Jméno",
        oldValue: data.oldName,
        newValue: data.newName,
      },
      {
        label: "Příjmení",
        oldValue: data.oldSurname,
        newValue: data.newSurname,
      },
      {
        label: "Titul za jménem",
        oldValue: data.oldTitleAfter,
        newValue: data.newTitleAfter,
      },
    ],
    [data]
  )

  const positionItems = useMemo<ChangeItem[]>(
    () => [
      {
        label: "Číslo funkce",
        oldValue: data.oldPositionNum,
        newValue: data.newPositionNum,
      },
      {
        label: "Pozice",
        oldValue: data.oldPositionName,
        newValue: data.newPositionName,
      },
      {
        label: "Odbor",
        oldValue: data.oldDepartment,
        newValue: data.newDepartment,
      },
      {
        label: "Oddělení",
        oldValue: data.oldUnitName,
        newValue: data.newUnitName,
      },
    ],
    [data]
  )

  async function handleDelete() {
    setDeleting(true)

    try {
      const response = await fetch(`/api/zmeny/${data.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const json = await response.json().catch(() => null)
        throw new Error(json?.message ?? "Smazání se nezdařilo.")
      }

      setDeleteDialogOpen(false)
      router.push("/zmeny")
      router.refresh()
    } catch (error) {
      setErrorDialog({
        open: true,
        message:
          error instanceof Error ? error.message : "Smazání se nezdařilo.",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="mb-1 text-2xl font-bold">Detail změny</h1>
          <p className="break-words text-muted-foreground">{fullName}</p>
          {data.personalNumber && (
            <p className="font-mono text-sm text-muted-foreground">
              #{data.personalNumber}
            </p>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/zmeny")}
        >
          <ArrowLeft className="mr-2 size-4" />
          Zpět
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <User className="mt-0.5 size-5 text-muted-foreground" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Typ změny</p>
              <Badge variant="outline">{typeLabel(data.type)}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <CalendarDays className="mt-0.5 size-5 text-muted-foreground" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Účinnost</p>
              <p className="text-muted-foreground">
                {fmtDate(data.effectiveDate)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-5 text-muted-foreground" />
            <div className="space-y-1 text-sm">
              <p className="font-medium">Evidence</p>
              <p className="text-muted-foreground">
                {audienceLabel(data.audience)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-semibold text-amber-950 dark:text-amber-100">
              Změna je pouze informační vazba
            </p>
            <p className="mt-1 text-amber-900 dark:text-amber-200">
              Nástupy ani odchody se touto změnou nepřepisují. Záznamy se jen
              dohledávají podle osobního čísla a u člověka se zobrazí informační
              ikonka.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="outline" className="bg-background/60">
                Nástupy: {onboardingMatchesCount}
              </Badge>
              <Badge variant="outline" className="bg-background/60">
                Odchody: {offboardingMatchesCount}
              </Badge>
              <Badge variant="outline" className="bg-background/60">
                Celkem vazeb: {linkCandidateCount}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {isNameChange && (
        <ChangeComparisonCard
          title="Změny jména a titulů"
          description="Zobrazené jsou jen hodnoty, které se opravdu liší."
          items={nameItems}
        />
      )}

      {isPositionChange && (
        <ChangeComparisonCard
          title="Změny pozice, funkce a organizačního zařazení"
          description="Zobrazené jsou jen hodnoty, které se opravdu liší."
          items={positionItems}
        />
      )}

      {data.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Poznámka</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data.notes}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-2">
          {data.emailSentAt && (
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="size-4" />
              <span>Report odeslán {fmtDate(data.emailSentAt)}</span>
            </div>
          )}

          <div>
            <span className="font-medium text-muted-foreground">
              Naposledy upraveno:{" "}
            </span>
            {fmtDate(data.updatedAt)}
          </div>

          <div>
            <span className="font-medium text-muted-foreground">
              Vytvořeno:{" "}
            </span>
            {fmtDate(data.createdAt)}
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap gap-2">
        <HistoryDialog id={data.id} kind="employee-change" />

        <Button
          variant="outline"
          onClick={() => router.push(`/zmeny/${data.id}/editovat`)}
        >
          <Edit className="mr-2 size-4" />
          Upravit
        </Button>

        <Button
          variant="destructive"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={deleting}
        >
          <Trash2 className="mr-2 size-4" />
          Smazat
        </Button>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          className="max-w-md"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertTriangle className="size-5 text-red-600 dark:text-red-400" />
              </div>

              <div>
                <DialogTitle>Smazat změnu?</DialogTitle>
                <DialogDescription>{fullName}</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <p className="text-sm text-muted-foreground">
            Záznam bude přesunut mezi smazané změny. Nepůjde o fyzické
            odstranění z databáze a záznam půjde obnovit přes „Smazané záznamy“.
          </p>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Zrušit
            </Button>

            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting || isReadonly}
              className="flex items-center gap-2"
            >
              {deleting && (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              )}
              {deleting ? "Mažu..." : "Smazat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={errorDialog.open}
        onOpenChange={(open) =>
          setErrorDialog((previous) => ({
            ...previous,
            open,
          }))
        }
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-4">
            <XCircle className="size-12 text-red-500" />
            <div className="space-y-2">
              <DialogTitle className="text-lg font-semibold">
                Nepodařilo se smazat změnu
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {errorDialog.message}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setErrorDialog({
                  open: false,
                  message: "",
                })
              }
            >
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
