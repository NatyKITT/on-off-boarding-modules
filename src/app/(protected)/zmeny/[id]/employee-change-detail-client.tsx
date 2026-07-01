"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Edit,
  Link2,
  Trash2,
  XCircle,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

type Target = {
  id: number
  targetType: string
  targetId: number
  appliedAt: string
  appliedBy: string
}

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
  targets: Target[]

  onboardingMatchesCount?: number
  offboardingMatchesCount?: number
  linkCandidateCount?: number
}

function fmtDate(value?: string | null) {
  if (!value) return "–"

  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? "–"
    : format(date, "d.M.yyyy", { locale: cs })
}

function typeLabel(type: string) {
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

function targetTypeLabel(type: string) {
  return type === "ONBOARDING" ? "Nástup" : "Odchod"
}

function changed(a?: string | null, b?: string | null) {
  return (a ?? null) !== (b ?? null)
}

function linkCandidateCount(data: ChangeData) {
  return data.linkCandidateCount ?? 0
}

function ChangeRow({
  label,
  oldValue,
  newValue,
}: {
  label: string
  oldValue?: string | null
  newValue?: string | null
}) {
  const hasChange = changed(oldValue, newValue)

  if (!oldValue && !newValue) return null

  return (
    <div className="grid grid-cols-[140px_1fr_1fr] gap-2 border-b border-muted py-1.5 text-sm last:border-0">
      <span className="pt-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className={hasChange ? "text-muted-foreground line-through" : ""}>
        {oldValue || "–"}
      </span>
      <span
        className={
          hasChange ? "font-medium text-green-700 dark:text-green-400" : ""
        }
      >
        {newValue || "–"}
      </span>
    </div>
  )
}

export function EmployeeChangeDetailClient({ data }: { data: ChangeData }) {
  const router = useRouter()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorDialog, setErrorDialog] = useState({
    open: false,
    message: "",
  })

  const fullName = [data.titleBefore, data.name, data.surname, data.titleAfter]
    .filter(Boolean)
    .join(" ")
    .trim()

  const isNameChange = data.type === "NAME" || data.type === "NAME_AND_POSITION"
  const isPositionChange =
    data.type === "POSITION" || data.type === "NAME_AND_POSITION"
  const hasLinkedTargets = data.targets.length > 0 || data.status === "APPLIED"
  const hasLinkCandidates = !hasLinkedTargets && linkCandidateCount(data) > 0

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
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">Detail změny</h1>
          <p className="text-muted-foreground">{fullName}</p>
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

      <div className="grid grid-cols-1 gap-3 rounded-lg border p-4 text-sm md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">Typ:</span>
            <Badge variant="outline">{typeLabel(data.type)}</Badge>
          </div>

          <div>
            <span className="font-medium text-muted-foreground">
              Datum účinnosti:{" "}
            </span>
            {fmtDate(data.effectiveDate)}
          </div>

          <div>
            <span className="font-medium text-muted-foreground">Skupina: </span>
            {audienceLabel(data.audience)}
          </div>
        </div>

        <div className="space-y-2">
          {hasLinkedTargets && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
              <Link2 className="size-4" />
              <span>Propojeno {fmtDate(data.appliedAt)}</span>
            </div>
          )}

          {hasLinkCandidates && (
            <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              <span>Nalezen související nástup/odchod</span>
            </div>
          )}

          {data.emailSentAt && (
            <div className="flex items-center gap-1 text-green-700 dark:text-green-400">
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
        </div>
      </div>

      {hasLinkCandidates && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900/60 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Změna má související záznam
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-200">
              Podle osobního čísla byl nalezen nástup nebo odchod. Propojení je
              volitelné — změna je aktivní a do měsíčního reportu spadá i bez
              propojení.
            </p>
          </div>
        </div>
      )}

      {data.targets.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Propojené záznamy</h2>
          <div className="space-y-2">
            {data.targets.map((target) => (
              <div
                key={target.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline">
                    {targetTypeLabel(target.targetType)}
                  </Badge>
                  <span className="text-muted-foreground">
                    ID {target.targetId}
                  </span>
                  <span className="text-muted-foreground">
                    Propojeno {fmtDate(target.appliedAt)}
                  </span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    router.push(
                      target.targetType === "ONBOARDING"
                        ? `/nastupy/${target.targetId}`
                        : `/odchody/${target.targetId}`
                    )
                  }
                >
                  Otevřít
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {isNameChange && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Změny jména / titulů</h2>
          <div className="rounded-lg border p-4">
            <div className="grid grid-cols-[140px_1fr_1fr] gap-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Pole</span>
              <span>Původní hodnota</span>
              <span>Nová hodnota</span>
            </div>

            <ChangeRow
              label="Titul před"
              oldValue={data.oldTitleBefore}
              newValue={data.newTitleBefore}
            />
            <ChangeRow
              label="Jméno"
              oldValue={data.oldName}
              newValue={data.newName}
            />
            <ChangeRow
              label="Příjmení"
              oldValue={data.oldSurname}
              newValue={data.newSurname}
            />
            <ChangeRow
              label="Titul za"
              oldValue={data.oldTitleAfter}
              newValue={data.newTitleAfter}
            />
          </div>
        </div>
      )}

      {isPositionChange && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Změny pozice / odboru</h2>
          <div className="rounded-lg border p-4">
            <div className="grid grid-cols-[140px_1fr_1fr] gap-2 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span>Pole</span>
              <span>Původní hodnota</span>
              <span>Nová hodnota</span>
            </div>

            <ChangeRow
              label="Č. funkce"
              oldValue={data.oldPositionNum}
              newValue={data.newPositionNum}
            />
            <ChangeRow
              label="Pozice"
              oldValue={data.oldPositionName}
              newValue={data.newPositionName}
            />
            <ChangeRow
              label="Odbor"
              oldValue={data.oldDepartment}
              newValue={data.newDepartment}
            />
            <ChangeRow
              label="Oddělení"
              oldValue={data.oldUnitName}
              newValue={data.newUnitName}
            />
          </div>
        </div>
      )}

      {data.notes && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <span className="font-medium">Poznámka: </span>
          {data.notes}
        </div>
      )}

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
        <DialogContent className="max-w-md">
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
              disabled={deleting}
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
