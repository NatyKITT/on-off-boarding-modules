"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Check, Lock, Printer, Undo2 } from "lucide-react"
import { useSession } from "next-auth/react"

import type {
  ExitAssetItem,
  ExitChecklistData,
  ExitChecklistItem,
  ExitResolvedValue,
} from "@/types/exit-checklist"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Props = {
  offboardingId: number
  initialData: ExitChecklistData
  canEdit: boolean
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (data: ExitChecklistData) => void
  externalSaveTrigger?: number
}

function mergeItemsWithConfig(
  dataItems: ExitChecklistItem[]
): ExitChecklistItem[] {
  const existingByKey = new Map(dataItems.map((i) => [i.key, i]))

  return EXIT_CHECKLIST_ROWS.map((row) => {
    const found = existingByKey.get(row.key)
    return {
      ...row,
      resolved: found?.resolved ?? null,
      signedByName: found?.signedByName ?? null,
      signedByEmail: found?.signedByEmail ?? null,
      signedAt: found?.signedAt ?? null,
    }
  })
}

export function ExitChecklistForm({
  offboardingId,
  initialData,
  canEdit,
  onDirtyChange,
  onSaved,
  externalSaveTrigger,
}: Props) {
  const { data: session } = useSession()

  const [lockedAt, setLockedAt] = useState<string | null>(
    initialData.lockedAt ?? null
  )
  const [items, setItems] = useState<ExitChecklistItem[]>(
    mergeItemsWithConfig(initialData.items ?? [])
  )
  const [assets, setAssets] = useState<ExitAssetItem[]>(
    initialData.assets ?? []
  )
  const [dirty, setDirty] = useState(false)
  const [lastSaveTrigger, setLastSaveTrigger] = useState<number | undefined>(
    undefined
  )

  const isLocked = Boolean(lockedAt)
  const editable = canEdit && !isLocked

  const header = useMemo(
    () => ({
      employeeName: initialData.employeeName,
      personalNumber: initialData.personalNumber,
      department: initialData.department,
      unitName: initialData.unitName,
      employmentEndDate: initialData.employmentEndDate,
    }),
    [initialData]
  )

  const formattedDate = useMemo(
    () =>
      header.employmentEndDate
        ? format(new Date(header.employmentEndDate), "d.M.yyyy")
        : "",
    [header.employmentEndDate]
  )

  const currentUserName = session?.user?.name ?? ""
  const currentUserEmail = session?.user?.email ?? ""

  useEffect(() => {
    setLockedAt(initialData.lockedAt ?? null)
    setItems(mergeItemsWithConfig(initialData.items ?? []))
    setAssets(initialData.assets ?? [])
    setDirty(false)
  }, [initialData])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (
      externalSaveTrigger !== undefined &&
      externalSaveTrigger !== lastSaveTrigger
    ) {
      void handleSave(false).then(() => {
        setLastSaveTrigger(externalSaveTrigger)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSaveTrigger])

  function markDirty() {
    if (!dirty) {
      setDirty(true)
    }
  }

  function updateResolved(
    key: ExitChecklistItem["key"],
    value: ExitResolvedValue
  ) {
    if (!editable) return
    markDirty()
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: value,
            }
          : item
      )
    )
  }

  function signRow(key: ExitChecklistItem["key"]) {
    if (!editable || !currentUserEmail) return
    markDirty()
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: item.resolved ?? "YES",
              signedByName: currentUserName || item.signedByName,
              signedByEmail: currentUserEmail,
              signedAt: new Date().toISOString(),
            }
          : item
      )
    )
  }

  function revokeSignature(key: ExitChecklistItem["key"]) {
    if (!canEdit) return
    markDirty()
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              signedByName: null,
              signedByEmail: null,
              signedAt: null,
            }
          : item
      )
    )
  }

  function addAssetRow() {
    if (!editable) return
    markDirty()
    setAssets((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        subject: "",
        inventoryNumber: "",
      },
    ])
  }

  function updateAsset(
    id: string,
    field: "subject" | "inventoryNumber",
    value: string
  ) {
    if (!editable) return
    markDirty()
    setAssets((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              [field]: value,
            }
          : a
      )
    )
  }

  function removeAsset(id: string) {
    if (!editable) return
    markDirty()
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleSave(lockAfterSave: boolean) {
    try {
      const res = await fetch(`/api/odchody/${offboardingId}/exit-checklist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lock: lockAfterSave,
          items: items.map((i) => ({
            key: i.key,
            resolved: i.resolved,
            signedByName: i.signedByName,
            signedByEmail: i.signedByEmail,
            signedAt: i.signedAt,
          })),
          assets: assets.map((a) => ({
            subject: a.subject,
            inventoryNumber: a.inventoryNumber,
          })),
        }),
      })

      if (!res.ok) {
        console.error("Nepodařilo se uložit výstupní list")
        return
      }

      const json = (await res.json()) as {
        status?: string
        data?: ExitChecklistData
      }

      if (json.data) {
        const merged = mergeItemsWithConfig(json.data.items ?? [])
        setItems(merged)
        setAssets(json.data.assets ?? [])
        setLockedAt(json.data.lockedAt ?? null)
        setDirty(false)
        onSaved?.(json.data)
      }
    } catch (err) {
      console.error("Chyba při ukládání výstupního listu:", err)
    }
  }

  async function handleGeneratePdf() {
    window.open(
      `/api/odchody/${offboardingId}/vystupni-list`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  const isLockedBadge = isLocked ? (
    <Badge variant="outline" className="flex items-center gap-1">
      <Lock className="size-3" />
      Uzamčeno k úpravám
    </Badge>
  ) : (
    <Badge variant="secondary">Rozpracováno</Badge>
  )

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>Výstupní list</span>
            {isLockedBadge}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
            <div>
              <span className="font-medium text-muted-foreground">
                Zaměstnanec:
              </span>{" "}
              {header.employeeName}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Osobní číslo:
              </span>{" "}
              {header.personalNumber ?? "–"}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-[1.5fr,1fr]">
            <div>
              <span className="font-medium text-muted-foreground">
                Odbor / oddělení:
              </span>{" "}
              {header.department} – {header.unitName}
            </div>
            <div>
              <span className="font-medium text-muted-foreground">
                Datum skončení pracovního poměru:
              </span>{" "}
              {formattedDate || "–"}
            </div>
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Podpis zaměstnance a podpis vedoucího odboru se doplní ručně až na
            vytištěném formuláři.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vyrovnání závazků zaměstnance k zaměstnavateli
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Odbor / organizace</TableHead>
                <TableHead>Závazek</TableHead>
                <TableHead className="w-[110px] text-center">
                  Vyrovnán
                </TableHead>
                <TableHead className="w-[150px]">Datum a podpis</TableHead>
                <TableHead className="w-[150px] text-right">Akce</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isSigned = Boolean(item.signedAt)
                const signedAtDate = item.signedAt
                  ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                  : ""
                const currentUserIsSigner =
                  item.signedByEmail &&
                  currentUserEmail &&
                  item.signedByEmail === currentUserEmail

                return (
                  <TableRow key={item.key}>
                    <TableCell className="align-top text-sm">
                      {item.organization}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {item.obligation}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      {editable ? (
                        <div className="inline-flex items-center gap-1 rounded-md bg-muted px-1 py-0.5 text-xs">
                          <button
                            type="button"
                            className={`rounded px-2 py-0.5 ${
                              item.resolved === "YES"
                                ? "bg-green-600 text-white"
                                : "hover:bg-green-100 dark:hover:bg-green-900/40"
                            }`}
                            onClick={() => updateResolved(item.key, "YES")}
                          >
                            Ano
                          </button>
                          <button
                            type="button"
                            className={`rounded px-2 py-0.5 ${
                              item.resolved === "NO"
                                ? "bg-red-600 text-white"
                                : "hover:bg-red-100 dark:hover:bg-red-900/40"
                            }`}
                            onClick={() => updateResolved(item.key, "NO")}
                          >
                            Ne
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium">
                          {item.resolved === "YES"
                            ? "Ano"
                            : item.resolved === "NO"
                              ? "Ne"
                              : "–"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {isSigned ? (
                        <div className="flex flex-col">
                          <span>{item.signedByName}</span>
                          <span className="text-xs text-muted-foreground">
                            {signedAtDate}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Nepodepsáno
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex justify-end gap-2">
                        {editable && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => signRow(item.key)}
                          >
                            <Check className="size-4" />
                            Podepsat
                          </Button>
                        )}
                        {isSigned && (canEdit || currentUserIsSigner) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-xs text-muted-foreground"
                            onClick={() => revokeSignature(item.key)}
                          >
                            <Undo2 className="size-4" />
                            Zrušit podpis
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Zapůjčený movitý majetek (mobilní telefon, fotopřístroje…)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Odpovídá části „Výpis z osobní karty zaměstnance… / předmět –
            inventární číslo“ v papírovém formuláři.
          </p>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Předmět</TableHead>
                <TableHead className="w-[200px]">Inventární číslo</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3}>
                    <p className="text-sm text-muted-foreground">
                      Zatím žádné položky. Přidejte je tlačítkem níže.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {assets.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={asset.subject}
                        onChange={(e) =>
                          updateAsset(asset.id, "subject", e.target.value)
                        }
                        placeholder="např. mobilní telefon"
                      />
                    ) : (
                      <span>{asset.subject}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <Input
                        value={asset.inventoryNumber}
                        onChange={(e) =>
                          updateAsset(
                            asset.id,
                            "inventoryNumber",
                            e.target.value
                          )
                        }
                        placeholder="např. 123456"
                      />
                    ) : (
                      <span>{asset.inventoryNumber}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {editable && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeAsset(asset.id)}
                        aria-label="Odebrat položku"
                      >
                        ×
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {editable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAssetRow}
            >
              Přidat položku
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              Po uzamčení formuláře již nepůjde běžným uživatelům měnit. Ruční
              podpis zaměstnance a vedoucího odboru se doplní až na vytištěném
              PDF.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleGeneratePdf()}
              className="gap-1"
            >
              <Printer className="size-4" />
              Vygenerovat PDF k tisku
            </Button>

            {editable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSave(false)}
                >
                  Uložit průběžně
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                  onClick={() => void handleSave(true)}
                >
                  Uložit a uzamknout
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
