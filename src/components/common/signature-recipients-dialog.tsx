"use client"

import { useMemo, useState } from "react"
import {
  Info,
  Loader2,
  Mail,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react"

import {
  buildBehalfOptions,
  formatObligations,
} from "@/lib/exit-checklist-behalf-options"
import { recipientIdentityKey } from "@/lib/exit-checklist-recipient-key"
import { joinNameWithTitles } from "@/lib/format-name"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EmployeeItem } from "@/components/common/employee-combobox"
import { EosPersonPickerDialog } from "@/components/common/eos-person-picker-dialog"

type Recipient = {
  name: string
  email: string
  rowKeys?: string[]
  behalfLabel?: string
  invitedAt?: string
  revokedAt?: string
}

type Props = {
  offboardingId: number
  employeeName: string
  managerName?: string | null
}

function formatDateTime(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function SignatureRecipientsDialog({
  offboardingId,
  employeeName,
  managerName,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [behalfMode, setBehalfMode] = useState(false)
  const [behalfOf, setBehalfOf] = useState("")

  const [removeTarget, setRemoveTarget] = useState<Recipient | null>(null)
  const [removing, setRemoving] = useState(false)
  const [restoringKey, setRestoringKey] = useState<string | null>(null)

  const behalfOptions = useMemo(
    () => buildBehalfOptions(managerName),
    [managerName]
  )

  const selectedBehalfOption = useMemo(
    () => behalfOptions.find((option) => option.value === behalfOf) ?? null,
    [behalfOf, behalfOptions]
  )

  async function loadRecipients() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/odchody/${offboardingId}/exit-checklist`, {
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      const data = json?.data as
        | { signatureRecipients?: Recipient[] }
        | undefined
      setRecipients(
        Array.isArray(data?.signatureRecipients) ? data.signatureRecipients : []
      )
    } catch {
      setError("Nepodařilo se načíst seznam příjemců.")
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setInfo(null)
      setError(null)
      setNewName("")
      setNewEmail("")
      setAddError(null)
      setRemoveTarget(null)
      setBehalfMode(false)
      setBehalfOf("")
      void loadRecipients()
    }
  }

  async function sendInvite(
    name: string,
    email: string,
    behalf?: { displayLabel: string; rowKeys: string[] }
  ) {
    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeEmail: email,
          inviteeName: name,
          ...(behalf
            ? {
                isBehalf: true,
                behalfOfDisplayLabel: behalf.displayLabel,
                behalfOfRowKeys: behalf.rowKeys,
              }
            : {}),
        }),
      }
    )
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok && res.status !== 207) {
      throw new Error(json.error ?? "Pozvánku se nepodařilo odeslat.")
    }
  }

  async function handleAdd() {
    setAddError(null)
    setInfo(null)
    const email = newEmail.trim().toLowerCase()
    const name = newName.trim()

    if (!email) {
      setAddError("E-mail je povinný.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setAddError("Zadejte platný e-mail.")
      return
    }
    if (behalfMode && !selectedBehalfOption) {
      setAddError("Vyberte, za koho bude příjemce podepisovat.")
      return
    }

    const candidateKey = recipientIdentityKey({
      email,
      behalfLabel:
        behalfMode && selectedBehalfOption
          ? selectedBehalfOption.displayLabel
          : undefined,
    })
    const existingMatch = recipients.find(
      (r) => recipientIdentityKey(r) === candidateKey
    )
    if (existingMatch?.revokedAt) {
      setAddError(
        "Tento příjemce byl ze seznamu zrušen. Použijte tlačítko „Vrátit“ u něj níže."
      )
      return
    }
    if (existingMatch) {
      setAddError("Tento příjemce už je v seznamu.")
      return
    }

    setAdding(true)
    try {
      await sendInvite(
        name || email,
        email,
        behalfMode && selectedBehalfOption
          ? {
              displayLabel: selectedBehalfOption.displayLabel,
              rowKeys: selectedBehalfOption.rowKeys,
            }
          : undefined
      )
      setNewName("")
      setNewEmail("")
      setBehalfMode(false)
      setBehalfOf("")
      setInfo(`Nová pozvánka k podpisu byla odeslána na ${email}.`)
      await loadRecipients()
    } catch (err) {
      setAddError(
        err instanceof Error ? err.message : "Pozvánku se nepodařilo odeslat."
      )
    } finally {
      setAdding(false)
    }
  }

  function handlePersonSelected(employee: EmployeeItem) {
    setNewName(
      joinNameWithTitles({
        titleBefore: employee.titleBefore,
        name: employee.name,
        surname: employee.surname,
        titleAfter: employee.titleAfter,
      })
    )
    setNewEmail(employee.email ?? "")
    setAddError(null)
  }

  async function saveRecipients(next: Recipient[]) {
    const res = await fetch(
      `/api/odchody/${offboardingId}/exit-checklist/signature-recipients`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "replace",
          recipients: next.map((r) => ({
            name: r.name,
            email: r.email,
            ...(r.rowKeys?.length ? { rowKeys: r.rowKeys } : {}),
            ...(r.behalfLabel ? { behalfLabel: r.behalfLabel } : {}),
            ...(r.invitedAt ? { invitedAt: r.invitedAt } : {}),
            ...(r.revokedAt ? { revokedAt: r.revokedAt } : {}),
          })),
        }),
      }
    )
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(json?.message ?? "Uložení se nezdařilo.")
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return

    const activeCount = recipients.filter((r) => !r.revokedAt).length
    if (activeCount <= 1 && !removeTarget.revokedAt) {
      setError(
        "Nelze zrušit posledního aktivního příjemce – v seznamu musí zůstat alespoň jeden."
      )
      setRemoveTarget(null)
      return
    }

    setRemoving(true)
    setError(null)
    try {
      const targetKey = recipientIdentityKey(removeTarget)
      const next = recipients.map((r) =>
        recipientIdentityKey(r) === targetKey
          ? { ...r, revokedAt: new Date().toISOString() }
          : r
      )

      await saveRecipients(next)

      setInfo(
        `${removeTarget.name} byl(a) odebrán(a) ze seznamu osob k podpisu – už nebude dostávat připomínky k podpisu a nebude moci tento výstupní list podepsat, dokud nebude vrácen(a) zpět do seznamu.`
      )
      setRemoveTarget(null)
      await loadRecipients()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zrušení se nezdařilo.")
    } finally {
      setRemoving(false)
    }
  }

  async function restoreRecipient(target: Recipient) {
    const targetKey = recipientIdentityKey(target)
    if (restoringKey) return

    setRestoringKey(targetKey)
    setError(null)
    try {
      const next = recipients.map((r) =>
        recipientIdentityKey(r) === targetKey
          ? { ...r, revokedAt: undefined }
          : r
      )

      await saveRecipients(next)

      setInfo(
        "Příjemce byl vrácen zpět do seznamu osob k podpisu – pozvánka se znovu neodesílá, ale opět se mu budou chodit připomínky a smí podepisovat."
      )
      await loadRecipients()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vrácení se nezdařilo.")
    } finally {
      setRestoringKey(null)
    }
  }

  const activeRecipients = recipients.filter((r) => !r.revokedAt)
  const revokedRecipients = recipients.filter((r) => r.revokedAt)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          className="gap-1 bg-[#00847C] text-white hover:bg-[#0B6D73]"
        >
          <Users className="size-4" />
          Seznam osob k podpisu
        </Button>
      </DialogTrigger>

      <DialogContent
        className="flex max-h-[90svh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="shrink-0 border-b px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="size-5 shrink-0" />
            Seznam osob k podpisu výstupního listu
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Kdo aktuálně smí a má podepsat výstupní list zaměstnance{" "}
            <strong>{employeeName}</strong>.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>
                Zde uvedeným osobám budou chodit automatické připomínky k
                podpisu tohoto výstupního listu, dokud nepodepíšou nebo dokud je
                odsud nezrušíte. Platí i pro odcházejícího zaměstnance. Jakmile
                někdo podepíše, připomínky mu přestanou chodit automaticky.
                Zrušený příjemce si výstupní list stále zobrazí, ale nesmí ho
                podepsat – zůstává níže v seznamu s poznámkou „Zrušeno“ a lze ho
                kdykoliv vrátit zpět (bez nové pozvánky).
              </span>
            </div>

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            {info && (
              <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                {info}
              </p>
            )}

            {loading ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Načítám seznam příjemců…
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>
                    Příjemci{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({activeRecipients.length})
                    </span>
                  </Label>

                  <div className="max-h-80 space-y-1 overflow-y-auto rounded-md border p-2">
                    {activeRecipients.length === 0 && (
                      <p className="py-3 text-center text-xs text-muted-foreground">
                        Zatím nikomu nebyla odeslána pozvánka k podpisu.
                      </p>
                    )}

                    {activeRecipients.map((r) => {
                      const invitedLabel = formatDateTime(r.invitedAt)

                      return (
                        <div
                          key={recipientIdentityKey(r)}
                          className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {r.name}
                            </p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {r.email}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {r.behalfLabel && (
                                <Badge
                                  variant="outline"
                                  className="border-purple-200 bg-purple-50 text-purple-700"
                                >
                                  v zastoupení za {r.behalfLabel}
                                </Badge>
                              )}
                              {invitedLabel && (
                                <span className="text-[11px] text-muted-foreground">
                                  Pozvánka odeslána {invitedLabel}
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-6 shrink-0 text-muted-foreground hover:text-red-600"
                            onClick={() => setRemoveTarget(r)}
                            title="Odebrat ze seznamu osob k podpisu"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {revokedRecipients.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-normal text-muted-foreground">
                      Zrušení příjemci ({revokedRecipients.length})
                    </Label>

                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-dashed p-2">
                      {revokedRecipients.map((r) => {
                        const revokedLabel = formatDateTime(r.revokedAt)
                        const key = recipientIdentityKey(r)

                        return (
                          <div
                            key={key}
                            className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 opacity-70 hover:bg-muted/50 hover:opacity-100"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {r.name}
                              </p>
                              <p className="truncate font-mono text-xs text-muted-foreground">
                                {r.email}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {r.behalfLabel && (
                                  <Badge
                                    variant="outline"
                                    className="border-purple-200 bg-purple-50 text-purple-700"
                                  >
                                    v zastoupení za {r.behalfLabel}
                                  </Badge>
                                )}
                                <Badge
                                  variant="outline"
                                  className="border-red-200 bg-red-50 text-red-700"
                                >
                                  Zrušeno
                                  {revokedLabel ? ` ${revokedLabel}` : ""}
                                </Badge>
                              </div>
                            </div>

                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 gap-1.5 text-xs"
                              onClick={() => void restoreRecipient(r)}
                              disabled={restoringKey === key}
                              title="Vrátit do seznamu příjemců"
                            >
                              {restoringKey === key ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <RotateCcw className="size-3" />
                              )}
                              Vrátit
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {removeTarget && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">
                  Odebrat {removeTarget.name} ze seznamu osob k podpisu?
                </p>
                <p className="text-xs">
                  Tomuto člověku už nebudou chodit automatické připomínky k
                  podpisu tohoto výstupního listu a nebude smět tento výstupní
                  list podepsat. Výstupní list si ale stále bude moci zobrazit a
                  kdykoliv ho lze vrátit zpět do seznamu příjemců.
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRemoveTarget(null)}
                    disabled={removing}
                  >
                    Storno
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => void confirmRemove()}
                    disabled={removing}
                    className="gap-2"
                  >
                    {removing && <Loader2 className="size-3.5 animate-spin" />}
                    Odebrat ze seznamu
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs font-medium">
                  <UserPlus className="mr-1 inline size-3" />
                  Přidat nového příjemce
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => setPickerOpen(true)}
                >
                  <Search className="size-3" />
                  Vybrat ze zaměstnanců
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder="Jméno (nepovinné)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-8 text-sm"
                  disabled={adding}
                />
                <Input
                  placeholder="email@praha6.cz"
                  value={newEmail}
                  onChange={(e) => {
                    setNewEmail(e.target.value)
                    setAddError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleAdd()
                  }}
                  className="h-8 text-sm"
                  disabled={adding}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 gap-1.5"
                  onClick={() => void handleAdd()}
                  disabled={adding}
                >
                  {adding ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Mail className="size-3.5" />
                  )}
                  Poslat pozvánku
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="behalf-mode"
                  checked={behalfMode}
                  onCheckedChange={(checked) => {
                    setBehalfMode(checked === true)
                    setAddError(null)
                  }}
                  disabled={adding}
                />
                <Label
                  htmlFor="behalf-mode"
                  className="text-xs font-normal text-muted-foreground"
                >
                  Přidat v zastoupení (podepíše místo jiné zodpovědné osoby /
                  odboru – dostane odlišný e-mail s pozvánkou)
                </Label>
              </div>

              {behalfMode && (
                <div className="space-y-1">
                  <Label>
                    Podepisuje v zastoupení za{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={behalfOf}
                    onValueChange={(value) => {
                      setBehalfOf(value)
                      setAddError(null)
                    }}
                    disabled={adding}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vyberte zodpovědnou osobu / odbor…" />
                    </SelectTrigger>
                    <SelectContent>
                      {behalfOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.selectLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {selectedBehalfOption && (
                    <div className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">
                      Týká se závazků:{" "}
                      {formatObligations(selectedBehalfOption.obligations)}
                    </div>
                  )}
                </div>
              )}

              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <p className="text-[11px] text-muted-foreground">
                Novému příjemci se hned odešle pozvánka k podpisu a přidá se do
                tohoto seznamu.
              </p>

              <EosPersonPickerDialog
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                title="Vybrat zaměstnance"
                onSelect={handlePersonSelected}
                excludeActiveOffboardings={false}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Zavřít
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
