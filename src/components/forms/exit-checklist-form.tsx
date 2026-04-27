"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Check, ChevronDown, Lock, Printer, Undo2 } from "lucide-react"
import { useSession } from "next-auth/react"

import type {
  ExitAssetItem,
  ExitChecklistData,
  ExitChecklistItem,
  ExitChecklistSignatures,
  ExitChecklistSignatureValue,
  ExitResolvedValue,
} from "@/types/exit-checklist"
import type { Position } from "@/types/position"
import { EXIT_CHECKLIST_ROWS } from "@/config/exit-checklist-rows"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SendInviteDialog } from "@/components/forms/send-invite-dialog"

type Props = {
  offboardingId?: number
  publicToken?: string
  mode?: "internal" | "public"
  initialData: ExitChecklistData
  onDirtyChange?: (dirty: boolean) => void
  onSaved?: (data: ExitChecklistData) => void
  externalSaveTrigger?: number
}

const SIGNING_DISABLED_KEYS: string[] = ["lawInfo"]

type SearchablePosition = Position & {
  _key: string
  _hay: string
}

type HeaderSignatureKey = "employee" | "manager" | "issuer"

const emptySignature = (): ExitChecklistSignatureValue => ({
  signedByName: null,
  signedByEmail: null,
  signedAt: null,
})

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultIssuedDate(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : getTodayIsoDate()
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

function stripAccents(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function normalizePositions(payload: unknown): Position[] {
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? ((payload as { data: unknown[] }).data ?? [])
    : Array.isArray(payload)
      ? payload
      : []

  const raw = arr.filter(
    (v): v is Record<string, unknown> => v != null && typeof v === "object"
  )

  const mapped: Position[] = raw
    .map((v) => {
      const num =
        typeof v.num === "string" || typeof v.num === "number"
          ? String(v.num)
          : ""

      if (!num) return null

      return {
        id:
          typeof v.id === "string" || typeof v.id === "number"
            ? String(v.id)
            : num,
        num,
        name: typeof v.name === "string" ? v.name : "",
        dept_name: typeof v.dept_name === "string" ? v.dept_name : "",
        unit_name: typeof v.unit_name === "string" ? v.unit_name : "",
      }
    })
    .filter((v): v is Position => Boolean(v))

  const byNum = new Map<string, Position>()
  for (const p of mapped) {
    if (!byNum.has(p.num)) {
      byNum.set(p.num, p)
      continue
    }

    const existing = byNum.get(p.num)!
    const existingScore =
      (existing.name ? 1 : 0) +
      (existing.dept_name ? 1 : 0) +
      (existing.unit_name ? 1 : 0)
    const nextScore =
      (p.name ? 1 : 0) + (p.dept_name ? 1 : 0) + (p.unit_name ? 1 : 0)

    if (nextScore > existingScore) {
      byNum.set(p.num, p)
    }
  }

  return Array.from(byNum.values())
}

type HeaderSignatureBlockProps = {
  label: string
  value: ExitChecklistSignatureValue
  isLocked: boolean
  isAdmin: boolean
  currentUserName: string
  currentUserEmail: string
  onSign: () => void
  onRevoke: () => void
}

function HeaderSignatureBlock({
  label,
  value,
  isLocked,
  isAdmin,
  currentUserName,
  currentUserEmail,
  onSign,
  onRevoke,
}: HeaderSignatureBlockProps) {
  const isSigned = Boolean(value.signedAt)

  const currentUserIsSigner =
    Boolean(value.signedByEmail) && value.signedByEmail === currentUserEmail

  const canRevoke = !isLocked && isSigned && (isAdmin || currentUserIsSigner)
  const canSign =
    !isLocked && !isSigned && Boolean(currentUserName || currentUserEmail)

  const signedAtDate = value.signedAt
    ? format(new Date(value.signedAt), "d.M.yyyy HH:mm")
    : ""

  return (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-sm font-medium">{label}</Label>

      {isSigned ? (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <div>{value.signedByName ?? "Podepsáno"}</div>
          <div className="text-xs text-muted-foreground">{signedAtDate}</div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
          Nepodepsáno
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {canSign && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={onSign}
          >
            <Check className="size-4" />
            Podepsat elektronicky
          </Button>
        )}

        {canRevoke && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1 text-xs text-muted-foreground"
            onClick={onRevoke}
          >
            <Undo2 className="size-4" />
            Zrušit podpis
          </Button>
        )}
      </div>
    </div>
  )
}

export function ExitChecklistForm({
  offboardingId,
  publicToken,
  mode = "internal",
  initialData,
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

  const [includeHandoverAgenda, setIncludeHandoverAgenda] = useState(
    initialData.handover?.includeHandoverAgenda ?? false
  )
  const [handoverOption1, setHandoverOption1] = useState(
    initialData.handover?.option1 ?? false
  )
  const [handoverOption2, setHandoverOption2] = useState(
    initialData.handover?.option2 ?? false
  )
  const [handoverOption2Target, setHandoverOption2Target] = useState(
    initialData.handover?.option2Target ?? ""
  )
  const [
    handoverOption2TargetPositionNum,
    setHandoverOption2TargetPositionNum,
  ] = useState(initialData.handover?.option2TargetPositionNum ?? "")
  const [handoverOption3, setHandoverOption3] = useState(
    initialData.handover?.option3 ?? false
  )
  const [handoverOption3Reason, setHandoverOption3Reason] = useState(
    initialData.handover?.option3Reason ?? ""
  )
  const [responsibleParty, setResponsibleParty] = useState<
    "KITT6" | "OSSL_KT" | null
  >(initialData.handover?.responsibleParty ?? null)

  const [signatures, setSignatures] = useState<ExitChecklistSignatures>({
    employee: initialData.signatures?.employee ?? emptySignature(),
    manager: initialData.signatures?.manager ?? emptySignature(),
    issuer: initialData.signatures?.issuer ?? emptySignature(),
    issuedDate: getDefaultIssuedDate(initialData.signatures?.issuedDate),
  })

  const [positions, setPositions] = useState<Position[]>([])
  const [loadingPositions, setLoadingPositions] = useState(false)
  const [positionPickerOpen, setPositionPickerOpen] = useState(false)
  const [positionQuery, setPositionQuery] = useState("")

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSaveTrigger, setLastSaveTrigger] = useState<number | undefined>(
    undefined
  )
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const isLocked = mode === "internal" ? Boolean(lockedAt) : false

  const role = session?.user.role ?? "USER"
  const isAdmin = role === "ADMIN" || role === "HR" || role === "IT"

  const isInternalMode = mode === "internal"
  const canInvite = isInternalMode && isAdmin && Boolean(offboardingId)
  const canLock = isInternalMode && isAdmin
  const canGeneratePdf = isInternalMode && Boolean(offboardingId)

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

  const positionsForSearch: SearchablePosition[] = useMemo(
    () =>
      positions.map((p) => ({
        ...p,
        _key: `${p.num} ${p.name}`,
        _hay: stripAccents(`${p.num} ${p.name} ${p.dept_name} ${p.unit_name}`),
      })),
    [positions]
  )

  const filteredPositions = useMemo(() => {
    const q = stripAccents(positionQuery.trim())
    if (!q) return positionsForSearch
    return positionsForSearch.filter((p) => p._hay.includes(q))
  }, [positionsForSearch, positionQuery])

  useEffect(() => {
    const merged = mergeItemsWithConfig(initialData.items ?? [])

    setLockedAt(initialData.lockedAt ?? null)
    setItems(merged)
    setAssets(initialData.assets ?? [])

    setIncludeHandoverAgenda(
      initialData.handover?.includeHandoverAgenda ?? false
    )
    setHandoverOption1(initialData.handover?.option1 ?? false)
    setHandoverOption2(initialData.handover?.option2 ?? false)
    setHandoverOption2Target(initialData.handover?.option2Target ?? "")
    setHandoverOption2TargetPositionNum(
      initialData.handover?.option2TargetPositionNum ?? ""
    )
    setHandoverOption3(initialData.handover?.option3 ?? false)
    setHandoverOption3Reason(initialData.handover?.option3Reason ?? "")
    setResponsibleParty(initialData.handover?.responsibleParty ?? null)

    setSignatures({
      employee: initialData.signatures?.employee ?? emptySignature(),
      manager: initialData.signatures?.manager ?? emptySignature(),
      issuer: initialData.signatures?.issuer ?? emptySignature(),
      issuedDate: getDefaultIssuedDate(initialData.signatures?.issuedDate),
    })

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

  useEffect(() => {
    if (!includeHandoverAgenda || !handoverOption2 || positions.length > 0) {
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        setLoadingPositions(true)
        const res = await fetch("/api/systemizace", { cache: "no-store" })
        const json = await res.json().catch(() => null)
        const normalized = normalizePositions(json)

        if (!cancelled) {
          setPositions(normalized)
        }
      } catch (err) {
        console.error("Nepodařilo se načíst systemizaci:", err)
      } finally {
        if (!cancelled) {
          setLoadingPositions(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [includeHandoverAgenda, handoverOption2, positions.length])

  function markDirty() {
    if (!dirty) {
      setDirty(true)
    }
  }

  function signHeaderSignature(key: HeaderSignatureKey) {
    if (isLocked || (!currentUserName && !currentUserEmail)) return

    setSignatures((prev) => ({
      ...prev,
      [key]: {
        signedByName: currentUserName || currentUserEmail,
        signedByEmail: currentUserEmail || null,
        signedAt: new Date().toISOString(),
      },
    }))

    markDirty()
    setStatusMessage("Elektronický podpis byl doplněn. Nezapomeňte uložit.")
    setTimeout(() => setStatusMessage(null), 3000)
  }

  function revokeHeaderSignature(key: HeaderSignatureKey) {
    if (isLocked) return

    const current = signatures[key]
    const isSigned = Boolean(current.signedAt)
    if (!isSigned) return

    const isSignedByCurrentUser =
      Boolean(current.signedByEmail) &&
      current.signedByEmail === currentUserEmail

    const canRevoke = isAdmin || isSignedByCurrentUser
    if (!canRevoke) return

    setSignatures((prev) => ({
      ...prev,
      [key]: emptySignature(),
    }))

    markDirty()
    setStatusMessage("Podpis byl zrušen.")
    setTimeout(() => setStatusMessage(null), 3000)
  }

  function updateResolved(
    key: ExitChecklistItem["key"],
    value: ExitResolvedValue
  ) {
    if (isLocked) return
    if (SIGNING_DISABLED_KEYS.includes(key)) return

    const current = items.find((i) => i.key === key)
    if (!current) return

    if (
      !isAdmin &&
      current.signedByEmail &&
      current.signedByEmail !== currentUserEmail
    ) {
      return
    }

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
    if (isLocked || !currentUserEmail) return

    const current = items.find((i) => i.key === key)
    if (!current) return

    const isAlreadySigned = Boolean(current.signedAt)
    if (isAlreadySigned) return

    markDirty()
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: "YES",
              signedByName: currentUserName || currentUserEmail,
              signedByEmail: currentUserEmail,
              signedAt: new Date().toISOString(),
            }
          : item
      )
    )
    setStatusMessage("Podpis byl přidán. Nezapomeňte uložit.")
    setTimeout(() => setStatusMessage(null), 3000)
  }

  function revokeSignature(key: ExitChecklistItem["key"]) {
    if (isLocked) return

    const current = items.find((i) => i.key === key)
    if (!current) return

    const isSigned = Boolean(current.signedAt)
    if (!isSigned) return

    const isSignedByCurrentUser =
      Boolean(current.signedByEmail) &&
      current.signedByEmail === currentUserEmail

    const canRevoke = isAdmin || isSignedByCurrentUser
    if (!canRevoke) return

    markDirty()
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              resolved: null,
              signedByName: null,
              signedByEmail: null,
              signedAt: null,
            }
          : item
      )
    )
    setStatusMessage("Podpis byl zrušen.")
    setTimeout(() => setStatusMessage(null), 3000)
  }

  function addAssetRow() {
    if (isLocked) return
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
    if (isLocked) return
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
    if (isLocked) return
    markDirty()
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  async function handleSave(lockAfterSave: boolean) {
    try {
      setSaving(true)

      const saveUrl = isInternalMode
        ? `/api/odchody/${offboardingId}/exit-checklist`
        : `/api/odchody/public/${publicToken}`

      const res = await fetch(saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          lock: isInternalMode ? lockAfterSave : false,
          items: items.map((i) => ({
            key: i.key,
            resolved: i.resolved,
            signedByName: i.signedByName,
            signedByEmail: i.signedByEmail,
            signedAt: i.signedAt,
          })),
          assets: assets.map((a) => ({
            id: a.id,
            subject: a.subject,
            inventoryNumber: a.inventoryNumber,
          })),
          handover: {
            includeHandoverAgenda,
            option1: handoverOption1,
            option2: handoverOption2,
            option2Target: handoverOption2Target,
            option2TargetPositionNum: handoverOption2TargetPositionNum,
            option3: handoverOption3,
            option3Reason: handoverOption3Reason,
            responsibleParty,
          },
          signatures,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        console.error(
          "Nepodařilo se uložit výstupní list.",
          json?.message ?? json?.error ?? res.statusText
        )
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

        setSignatures({
          employee: json.data.signatures?.employee ?? emptySignature(),
          manager: json.data.signatures?.manager ?? emptySignature(),
          issuer: json.data.signatures?.issuer ?? emptySignature(),
          issuedDate: getDefaultIssuedDate(json.data.signatures?.issuedDate),
        })

        setDirty(false)
        setStatusMessage("Výstupní list byl úspěšně uložen.")
        setTimeout(() => setStatusMessage(null), 3000)
        onSaved?.(json.data)
      }
    } catch (err) {
      console.error("Chyba při ukládání výstupního listu:", err)
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePdfWithSave() {
    if (!offboardingId) return
    await handleSave(false)
    window.open(
      `/api/odchody/${offboardingId}/vystupni-list`,
      "_blank",
      "noopener,noreferrer"
    )
  }

  const pdfButtonLabel = dirty ? "Uložit a vygenerovat PDF" : "Vygenerovat PDF"

  const isLockedBadge = isLocked ? (
    <Badge variant="outline" className="flex items-center gap-1">
      <Lock className="size-3" />
      Uzamčeno k úpravám
    </Badge>
  ) : (
    <Badge variant="secondary">
      {isInternalMode ? "Rozpracováno" : "Podpisový režim"}
    </Badge>
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

        <CardContent className="space-y-6 text-sm">
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

          <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
            <HeaderSignatureBlock
              label="Podpis zaměstnance"
              value={signatures.employee}
              isLocked={isLocked}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("employee")}
              onRevoke={() => revokeHeaderSignature("employee")}
            />

            <HeaderSignatureBlock
              label="Podpis vedoucího odboru"
              value={signatures.manager}
              isLocked={isLocked}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("manager")}
              onRevoke={() => revokeHeaderSignature("manager")}
            />
          </div>

          <div className="grid gap-4 border-t pt-4 md:grid-cols-[1fr,220px] md:items-start">
            <HeaderSignatureBlock
              label="pí Ing. Krýzová Martina, podpis"
              value={signatures.issuer}
              isLocked={isLocked}
              isAdmin={isAdmin}
              currentUserName={currentUserName}
              currentUserEmail={currentUserEmail}
              onSign={() => signHeaderSignature("issuer")}
              onRevoke={() => revokeHeaderSignature("issuer")}
            />

            <div className="space-y-2">
              <Label htmlFor="issuedDate">Datum vystavení</Label>
              <Input
                id="issuedDate"
                type="date"
                value={signatures.issuedDate ?? ""}
                onChange={(e) => {
                  setSignatures((prev) => ({
                    ...prev,
                    issuedDate: e.target.value,
                  }))
                  markDirty()
                }}
                disabled={isLocked}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {statusMessage && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          <Check className="size-4 shrink-0" />
          {statusMessage}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Vyrovnání závazků zaměstnance k zaměstnavateli
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="divide-y sm:hidden">
            {items.map((item) => {
              const isSigned = Boolean(item.signedAt)
              const signedAtDate = item.signedAt
                ? format(new Date(item.signedAt), "d.M.yyyy HH:mm")
                : ""
              const currentUserIsSigner =
                item.signedByEmail &&
                currentUserEmail &&
                item.signedByEmail === currentUserEmail
              const isSigningDisabled = SIGNING_DISABLED_KEYS.includes(item.key)
              const showSignButton = !isLocked && !isSigned
              const showRevokeButton =
                !isLocked && isSigned && (isAdmin || currentUserIsSigner)

              return (
                <div key={item.key} className="space-y-2 px-4 py-3">
                  <div className="text-xs font-medium text-muted-foreground">
                    {item.organization}
                  </div>
                  <div className="text-sm">{item.obligation}</div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {!isLocked && !isSigningDisabled ? (
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
                          ? "✓ Ano"
                          : item.resolved === "NO"
                            ? "✗ Ne"
                            : "–"}
                      </span>
                    )}

                    <div className="flex gap-2">
                      {showSignButton && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={isSigningDisabled}
                          onClick={() =>
                            !isSigningDisabled && signRow(item.key)
                          }
                        >
                          <Check className="size-3" />
                          Podepsat
                        </Button>
                      )}
                      {showRevokeButton && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs text-muted-foreground"
                          onClick={() => revokeSignature(item.key)}
                        >
                          <Undo2 className="size-3" />
                          Zrušit
                        </Button>
                      )}
                    </div>
                  </div>

                  {isSigned && (
                    <div className="text-xs text-muted-foreground">
                      {item.signedByName} · {signedAtDate}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">
                    Odbor / organizace
                  </TableHead>
                  <TableHead>Závazek</TableHead>
                  <TableHead className="w-[110px] text-center">
                    Vyrovnán
                  </TableHead>
                  <TableHead className="w-[180px]">Datum a podpis</TableHead>
                  <TableHead className="w-[170px] text-right">Akce</TableHead>
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
                  const isSigningDisabled = SIGNING_DISABLED_KEYS.includes(
                    item.key
                  )
                  const showSignButton = !isLocked && !isSigned
                  const showRevokeButton =
                    !isLocked && isSigned && (isAdmin || currentUserIsSigner)

                  return (
                    <TableRow key={item.key}>
                      <TableCell className="align-top text-sm">
                        {item.organization}
                      </TableCell>
                      <TableCell className="align-top text-sm">
                        {item.obligation}
                      </TableCell>
                      <TableCell className="text-center align-top">
                        {!isLocked && !isSigningDisabled ? (
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
                          {showSignButton && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              disabled={isSigningDisabled}
                              title={
                                isSigningDisabled
                                  ? "Tato položka zatím není dostupná k podpisu."
                                  : undefined
                              }
                              onClick={() =>
                                !isSigningDisabled && signRow(item.key)
                              }
                            >
                              <Check className="size-4" />
                              Podepsat
                            </Button>
                          )}
                          {showRevokeButton && (
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
          </div>
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
                    {!isLocked ? (
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
                    {!isLocked ? (
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
                    {!isLocked && (
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

          {!isLocked && (
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
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Předávaná agenda</span>

            {!isLocked && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="includeHandover"
                  checked={includeHandoverAgenda}
                  onCheckedChange={(checked) => {
                    const next = Boolean(checked)
                    setIncludeHandoverAgenda(next)

                    if (!next) {
                      setHandoverOption1(false)
                      setHandoverOption2(false)
                      setHandoverOption2Target("")
                      setHandoverOption2TargetPositionNum("")
                      setHandoverOption3(false)
                      setHandoverOption3Reason("")
                      setResponsibleParty(null)
                    }

                    markDirty()
                  }}
                />
                <Label
                  htmlFor="includeHandover"
                  className="cursor-pointer text-sm font-normal text-muted-foreground"
                >
                  Zahrnout předávanou agendu
                </Label>
              </div>
            )}

            {isLocked && includeHandoverAgenda && (
              <Badge variant="secondary">Zahrnuto</Badge>
            )}
          </CardTitle>
        </CardHeader>

        {includeHandoverAgenda && (
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">
              Elektronické dokumenty v e-spisu - elektronické přihlášení
              dokumentů (zakroužkujte realizovanou možnost)
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="handover1"
                  checked={handoverOption1}
                  onCheckedChange={(checked) => {
                    setHandoverOption1(Boolean(checked))
                    markDirty()
                  }}
                  disabled={isLocked}
                />
                <Label
                  htmlFor="handover1"
                  className={`text-sm ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                >
                  Předáno zaměstnancem do spisovny v e-spise nebo předáno na
                  jiné funkční místo
                </Label>
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="handover2"
                    checked={handoverOption2}
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked)
                      setHandoverOption2(next)

                      if (!next) {
                        setHandoverOption2Target("")
                        setHandoverOption2TargetPositionNum("")
                        setPositionPickerOpen(false)
                        setPositionQuery("")
                      }

                      markDirty()
                    }}
                    disabled={isLocked}
                  />
                  <Label
                    htmlFor="handover2"
                    className={`text-sm ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                  >
                    OI-KITT6 předá na jiné funkční místo
                  </Label>
                </div>

                {handoverOption2 && (
                  <div className="ml-7 space-y-2">
                    <Popover
                      open={positionPickerOpen}
                      onOpenChange={setPositionPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-between"
                          disabled={isLocked || loadingPositions}
                        >
                          <span className="truncate">
                            {handoverOption2Target ||
                              "Vyberte funkční místo ze systemizace"}
                          </span>
                          <ChevronDown className="ml-2 size-4 opacity-60" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-[420px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput
                            placeholder="Hledat číslo nebo název pozice..."
                            value={positionQuery}
                            onValueChange={setPositionQuery}
                          />
                          <CommandEmpty>
                            {loadingPositions
                              ? "Načítám pozice..."
                              : "Žádná pozice nenalezena"}
                          </CommandEmpty>
                          <CommandList className="max-h-80 overflow-y-auto">
                            <CommandGroup>
                              {filteredPositions.map((p) => (
                                <CommandItem
                                  key={p.id ?? p.num}
                                  value={`${p.num} ${p.name}`}
                                  onSelect={() => {
                                    setHandoverOption2Target(
                                      `${p.num} — ${p.name}`
                                    )
                                    setHandoverOption2TargetPositionNum(p.num)
                                    setPositionPickerOpen(false)
                                    setPositionQuery("")
                                    markDirty()
                                  }}
                                  className="flex items-start gap-3 py-3"
                                >
                                  <span className="min-w-[80px] rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                                    {p.num}
                                  </span>
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">
                                      {p.name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {p.dept_name} • {p.unit_name}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="handover3"
                    checked={handoverOption3}
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked)
                      setHandoverOption3(next)

                      if (!next) {
                        setHandoverOption3Reason("")
                        setResponsibleParty(null)
                      }

                      markDirty()
                    }}
                    disabled={isLocked}
                  />
                  <Label
                    htmlFor="handover3"
                    className={`text-sm ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                  >
                    Zůstává zatím na neobsazeném funkčním místě z důvodu:
                  </Label>
                </div>

                {handoverOption3 && (
                  <div className="ml-7 space-y-3">
                    <Input
                      value={handoverOption3Reason}
                      onChange={(e) => {
                        setHandoverOption3Reason(e.target.value)
                        markDirty()
                      }}
                      placeholder="např. do doby nástupu nového zaměstnance"
                      disabled={isLocked}
                    />

                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Za dokumenty odpovídá:
                      </p>

                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="resp-kitt6"
                            name="responsibleParty"
                            checked={responsibleParty === "KITT6"}
                            onChange={() => {
                              setResponsibleParty("KITT6")
                              markDirty()
                            }}
                            disabled={isLocked}
                            className="cursor-pointer disabled:cursor-default"
                          />
                          <Label
                            htmlFor="resp-kitt6"
                            className={`text-sm ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                          >
                            KITT6
                          </Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            id="resp-ossl"
                            name="responsibleParty"
                            checked={responsibleParty === "OSSL_KT"}
                            onChange={() => {
                              setResponsibleParty("OSSL_KT")
                              markDirty()
                            }}
                            disabled={isLocked}
                            className="cursor-pointer disabled:cursor-default"
                          />
                          <Label
                            htmlFor="resp-ossl"
                            className={`text-sm ${isLocked ? "cursor-default" : "cursor-pointer"}`}
                          >
                            OSSL KT
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              {isInternalMode
                ? "Po uzamčení formuláře již nepůjde běžným uživatelům měnit. Ruční podpis zaměstnance a vedoucího odboru se doplní až na vytištěném PDF."
                : "Výstupní list můžete doplnit, podepsat a uložit pod svým přihlášeným účtem."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canInvite && (
              <SendInviteDialog
                offboardingId={offboardingId!}
                employeeName={header.employeeName ?? ""}
              />
            )}

            {canGeneratePdf && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleGeneratePdfWithSave()}
                className="gap-1"
                disabled={saving}
              >
                <Printer className="size-4" />
                {pdfButtonLabel}
              </Button>
            )}

            {!isLocked && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSave(false)}
                  disabled={saving}
                >
                  Uložit
                </Button>

                {canLock && (
                  <Button
                    type="button"
                    size="sm"
                    className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
                    onClick={() => void handleSave(true)}
                    disabled={saving}
                  >
                    Uzamknout
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
