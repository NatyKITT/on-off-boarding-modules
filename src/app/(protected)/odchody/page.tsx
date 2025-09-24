"use client"

import * as React from "react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { format } from "date-fns"
import { cs } from "date-fns/locale"
import { History as HistoryIcon } from "lucide-react"

import { type Position } from "@/types/position"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDeleteButton } from "@/components/common/confirm-delete-button"
import { MonthlySummaryButton } from "@/components/emails/monthly-summary-button"
import { SendEmailButton } from "@/components/emails/send-email-button"
import { OffboardingFormUnified } from "@/components/forms/offboarding-form"
import { DeletedPlannedDialog } from "@/components/history/deleted-planned-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

/* ------------------------------ local types ----------------------------- */
type Departure = {
  id: number
  name: string
  surname: string
  titleBefore?: string | null
  titleAfter?: string | null
  department: string
  unitName: string
  positionName: string
  positionNum?: string | null
  plannedEnd: string
  actualEnd?: string | null
  userEmail?: string | null
  userName?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

/* -------------------------- positions normalizer ------------------------ */
type RawPos =
  | {
      id?: string | number
      num?: unknown
      name?: unknown
      dept_name?: unknown
      unit_name?: unknown
    }
  | null
  | undefined

function isRawPos(v: unknown): v is RawPos {
  if (v == null || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return "num" in o // num existence postačí, detail ověříme níž
}

function toPosition(v: RawPos): Position | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const num = o.num
  if (typeof num !== "string" && typeof num !== "number") return null
  const id = o.id
  const name = o.name
  const dept = o.dept_name
  const unit = o.unit_name
  return {
    id: String(id ?? num),
    num: String(num),
    name: typeof name === "string" ? name : "",
    dept_name: typeof dept === "string" ? dept : "",
    unit_name: typeof unit === "string" ? unit : "",
  }
}

function normalizePositions(payload: unknown): Position[] {
  // přijmeme buď { data: [...] } nebo rovnou pole
  const arr = Array.isArray((payload as { data?: unknown })?.data)
    ? (payload as { data: unknown[] }).data
    : Array.isArray(payload)
      ? (payload as unknown[])
      : []

  return arr
    .filter(isRawPos)
    .map(toPosition)
    .filter((x): x is Position => Boolean(x))
}

/* --------------------------------- page --------------------------------- */
export default function OffboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Departure[]>([])
  const [actual, setActual] = useState<Departure[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // nový záznam
  const [openNewPlanned, setOpenNewPlanned] = useState(false)
  const [openNewActual, setOpenNewActual] = useState(false)

  // potvrzení skutečného odchodu
  const [openActual, setOpenActual] = useState(false)
  const [activeRow, setActiveRow] = useState<Departure | null>(null)
  const [actualEndInput, setActualEndInput] = useState<string>("")

  // edit
  const [openEdit, setOpenEdit] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editInitial, setEditInitial] = useState<Partial<Departure> | null>(
    null
  )
  const [editLoading, setEditLoading] = useState(false)
  const [editContext, setEditContext] = useState<"planned" | "actual">(
    "planned"
  )

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined

  async function reload() {
    setLoading(true)
    try {
      const [posRes, offRes] = await Promise.all([
        fetch("/api/systematizace", { cache: "no-store" }),
        fetch("/api/odchody", { cache: "no-store" }),
      ])
      const posJson = await posRes.json().catch(() => null)
      const offJson = await offRes.json().catch(() => null)

      setPositions(normalizePositions(posJson))

      if (offJson?.status === "success" && Array.isArray(offJson.data)) {
        const rows = offJson.data as Departure[]
        setPlanned(rows.filter((e) => !e.actualEnd))
        setActual(rows.filter((e) => e.actualEnd))
      } else {
        setPlanned([])
        setActual([])
      }
    } catch {
      setPlanned([])
      setActual([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  useEffect(() => {
    if (!qpMode) return
    if (qpMode === "create-actual") setOpenNewActual(true)
    else setOpenNewPlanned(true)
  }, [qpMode])

  useEffect(() => {
    const handler = () => {
      void reload()
    }
    window.addEventListener("offboarding:deleted", handler)
    return () => window.removeEventListener("offboarding:deleted", handler)
  }, [])

  const thisMonth = format(new Date(), "yyyy-MM")
  const defaultPlannedMonth = useMemo(() => {
    const has = planned.find((e) => e.plannedEnd?.slice(0, 7) === thisMonth)
    return (
      has?.plannedEnd?.slice(0, 7) ?? planned[0]?.plannedEnd?.slice(0, 7) ?? ""
    )
  }, [planned, thisMonth])

  const actualMonths = useMemo(
    () =>
      Array.from(
        new Set(
          actual
            .map((e) => e.actualEnd?.slice(0, 7))
            .filter(Boolean) as string[]
        )
      ),
    [actual]
  )

  const defaultActualMonth = useMemo(() => {
    const has = actual.find((e) => e.actualEnd?.slice(0, 7) === thisMonth)
    return has?.actualEnd?.slice(0, 7) ?? actualMonths[0] ?? ""
  }, [actual, actualMonths, thisMonth])

  function openActualDialogFromPlanned(row: Departure) {
    setActiveRow(row)
    setActualEndInput(row.plannedEnd.slice(0, 10))
    setOpenActual(true)
  }

  async function confirmDepartureWithInput() {
    if (!activeRow || !actualEndInput) return
    try {
      const res = await fetch(`/api/odchody/${activeRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualEnd: actualEndInput,
          status: "COMPLETED",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        alert(j?.message ?? "Potvrzení se nezdařilo.")
        return
      }
      setOpenActual(false)
      setActiveRow(null)
      setActualEndInput("")
      await reload()
    } catch {
      alert("Potvrzení se nezdařilo.")
    }
  }

  async function openEditDialog(row: Departure, context: "planned" | "actual") {
    setEditContext(context)
    setEditId(row.id)
    setEditLoading(true)

    if (!positions.length) {
      try {
        const posRes = await fetch("/api/systematizace", { cache: "no-store" })
        const posJson = await posRes.json().catch(() => null)
        setPositions(normalizePositions(posJson))
      } catch {}
    }

    try {
      const res = await fetch(`/api/odchody/${row.id}`, { cache: "no-store" })
      if (res.ok) {
        const json = await res.json()
        const d = json?.data as Departure
        setEditInitial({
          titleBefore: d.titleBefore ?? "",
          name: d.name,
          surname: d.surname,
          titleAfter: d.titleAfter ?? "",
          positionNum: d.positionNum ?? undefined,
          positionName: d.positionName,
          department: d.department,
          unitName: d.unitName,
          plannedEnd: d.plannedEnd?.slice(0, 10),
          actualEnd: d.actualEnd?.slice(0, 10) ?? undefined,
          userEmail: d.userEmail ?? "",
          userName: d.userName ?? "",
          personalNumber: d.personalNumber ?? "",
          notes: d.notes ?? "",
          status: d.status,
        })
        setOpenEdit(true)
      } else {
        setEditInitial(null)
        alert("Nepodařilo se načíst data záznamu.")
      }
    } catch {
      setEditInitial(null)
      alert("Nepodařilo se načíst data záznamu.")
    } finally {
      setEditLoading(false)
    }
  }

  const btnGhostIcon = "inline-flex items-center justify-center gap-1 p-0"
  const btnSm = "inline-flex items-center justify-center gap-1"

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Odchody zaměstnanců</h1>

      <Tabs defaultValue="planned">
        <TabsList>
          <TabsTrigger value="planned">Předpokládané</TabsTrigger>
          <TabsTrigger value="actual">Skutečné</TabsTrigger>
        </TabsList>

        {/* ---------- PLANNED ---------- */}
        <TabsContent value="planned">
          <div className="mb-4 flex items-center justify-between">
            <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
              <DialogTrigger asChild>
                <Button
                  className="inline-flex items-center justify-center gap-2"
                  onClick={() => setOpenNewPlanned(true)}
                >
                  Přidat předpokládaný odchod
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-0">
                <DialogTitle className="px-6 pt-6">
                  Nový předpokládaný odchod
                </DialogTitle>
                <div className="max-h-[80vh] overflow-y-auto p-6">
                  <OffboardingFormUnified
                    positions={positions}
                    prefillDate={qpDate}
                    defaultCreateMode="create-planned"
                    onSuccess={async () => {
                      setOpenNewPlanned(false)
                      await reload()
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <DeletedPlannedDialog
              kind="offboarding"
              title="Smazané předpokládané odchody"
              successEvent="offboarding:deleted"
              restoreButtonClassName="inline-flex items-center justify-center gap-2 bg-amber-600 text-white hover:bg-amber-700"
              triggerLabel="Smazané záznamy"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : planned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné předpokládané odchody.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={defaultPlannedMonth ? [defaultPlannedMonth] : []}
            >
              {[...new Set(planned.map((e) => e.plannedEnd.slice(0, 7)))].map(
                (month) => (
                  <AccordionItem
                    key={month}
                    value={month}
                    className="rounded-xl border"
                    style={{ backgroundColor: "#f973161A" }}
                  >
                    <AccordionTrigger className="rounded-xl px-4 data-[state=open]:bg-white/60 dark:data-[state=open]:bg-black/20">
                      {format(new Date(`${month}-01`), "LLLL yyyy", {
                        locale: cs,
                      })}
                    </AccordionTrigger>
                    <AccordionContent>
                      <Card className="border-muted shadow-sm">
                        <CardContent className="px-0">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                              <TableRow>
                                <TableHead>Jméno</TableHead>
                                <TableHead>Pozice</TableHead>
                                <TableHead>Odbor</TableHead>
                                <TableHead>Oddělení</TableHead>
                                <TableHead>Předpokládaný odchod</TableHead>
                                <TableHead>Firemní účet</TableHead>
                                <TableHead className="text-right">
                                  Akce
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {planned
                                .filter((e) => e.plannedEnd.startsWith(month))
                                .map((e) => (
                                  <TableRow key={e.id}>
                                    <TableCell className="max-w-[360px] whitespace-normal break-words">
                                      <span className="font-medium">
                                        {[
                                          e.titleBefore,
                                          e.name,
                                          e.surname,
                                          e.titleAfter,
                                        ]
                                          .filter(Boolean)
                                          .join(" ")}
                                      </span>
                                    </TableCell>
                                    <TableCell>{e.positionName}</TableCell>
                                    <TableCell>{e.department}</TableCell>
                                    <TableCell>{e.unitName}</TableCell>
                                    <TableCell>
                                      {format(
                                        new Date(e.plannedEnd),
                                        "d.M.yyyy"
                                      )}
                                    </TableCell>
                                    <TableCell>{e.userEmail ?? "–"}</TableCell>
                                    <TableCell className="flex justify-end gap-2">
                                      <HistoryDialog
                                        id={e.id}
                                        kind="offboarding"
                                        trigger={
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className={btnGhostIcon}
                                            title="Historie změn"
                                            aria-label="Historie změn"
                                          >
                                            <HistoryIcon
                                              className="size-4"
                                              aria-hidden="true"
                                            />
                                          </Button>
                                        }
                                      />

                                      <div
                                        className="flex items-center gap-1"
                                        title="Poslat e-mail"
                                        aria-label="Poslat e-mail"
                                      >
                                        <SendEmailButton
                                          id={e.id}
                                          kind="offboarding"
                                          email={e.userEmail ?? undefined}
                                          onDone={() => void reload()}
                                          onEditRequest={() =>
                                            void openEditDialog(e, "planned")
                                          }
                                          className={btnGhostIcon}
                                        />
                                      </div>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className={btnSm}
                                        title="Upravit záznam"
                                        onClick={() =>
                                          void openEditDialog(e, "planned")
                                        }
                                      >
                                        Upravit
                                      </Button>

                                      <Button
                                        size="sm"
                                        className={`${btnSm} bg-amber-600 text-white hover:bg-amber-700`}
                                        title="Potvrdit skutečný odchod"
                                        onClick={() =>
                                          openActualDialogFromPlanned(e)
                                        }
                                      >
                                        Odešel
                                      </Button>

                                      <div
                                        className="flex items-center gap-1"
                                        title="Smazat záznam"
                                        aria-label="Smazat záznam"
                                      >
                                        <ConfirmDeleteButton
                                          size="sm"
                                          endpoint={`/api/odchody/${e.id}`}
                                          successEvent="offboarding:deleted"
                                          className={btnSm}
                                        />
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </AccordionContent>
                  </AccordionItem>
                )
              )}
            </Accordion>
          )}
        </TabsContent>

        {/* ---------- ACTUAL ---------- */}
        <TabsContent value="actual">
          <div className="mb-4 flex items-center justify-between">
            <Dialog open={openNewActual} onOpenChange={setOpenNewActual}>
              <DialogTrigger asChild>
                <Button
                  className="inline-flex items-center justify-center gap-2"
                  onClick={() => setOpenNewActual(true)}
                >
                  Přidat skutečný odchod
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl p-0">
                <DialogTitle className="px-6 pt-6">Skutečný odchod</DialogTitle>
                <div className="max-h-[80vh] overflow-y-auto p-6">
                  <OffboardingFormUnified
                    positions={positions}
                    defaultCreateMode="create-actual"
                    prefillDate={qpDate}
                    onSuccess={async () => {
                      setOpenNewActual(false)
                      await reload()
                    }}
                  />
                </div>
              </DialogContent>
            </Dialog>

            <MonthlySummaryButton
              candidateMonths={useMemo(() => actualMonths, [actualMonths])}
              defaultMonth={defaultActualMonth || thisMonth}
              label="Zaslat měsíční report"
              className="inline-flex items-center justify-center gap-2 bg-amber-600 text-white hover:bg-amber-700"
              onDone={() => void reload()}
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : actual.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné skutečné odchody.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={defaultActualMonth ? [defaultActualMonth] : []}
            >
              {actualMonths.map((month) => (
                <AccordionItem
                  key={month}
                  value={month}
                  className="rounded-xl border"
                  style={{ backgroundColor: "#ef44441A" }}
                >
                  <AccordionTrigger className="rounded-xl px-4 data-[state=open]:bg-white/60 dark:data-[state=open]:bg-black/20">
                    {format(new Date(`${month}-01`), "LLLL yyyy", {
                      locale: cs,
                    })}
                  </AccordionTrigger>
                  <AccordionContent>
                    <Card className="border-muted shadow-sm">
                      <CardContent className="px-0">
                        <Table>
                          <TableHeader className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                            <TableRow>
                              <TableHead>Jméno</TableHead>
                              <TableHead>Pozice</TableHead>
                              <TableHead>Odbor</TableHead>
                              <TableHead>Oddělení</TableHead>
                              <TableHead>Skutečný odchod</TableHead>
                              <TableHead>Uživatelské jméno</TableHead>
                              <TableHead>Firemní účet</TableHead>
                              <TableHead className="text-right">Akce</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {actual
                              .filter((e) => e.actualEnd?.startsWith(month))
                              .map((e) => (
                                <TableRow key={e.id}>
                                  <TableCell className="max-w-[360px] whitespace-normal break-words">
                                    <span className="font-medium">
                                      {[
                                        e.titleBefore,
                                        e.name,
                                        e.surname,
                                        e.titleAfter,
                                      ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    </span>
                                  </TableCell>
                                  <TableCell>{e.positionName}</TableCell>
                                  <TableCell>{e.department}</TableCell>
                                  <TableCell>{e.unitName}</TableCell>
                                  <TableCell>
                                    {e.actualEnd
                                      ? format(
                                          new Date(e.actualEnd),
                                          "d.M.yyyy"
                                        )
                                      : "–"}
                                  </TableCell>
                                  <TableCell>{e.userName ?? "–"}</TableCell>
                                  <TableCell>{e.userEmail ?? "–"}</TableCell>
                                  <TableCell className="flex justify-end gap-2">
                                    <HistoryDialog
                                      id={e.id}
                                      kind="offboarding"
                                      trigger={
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className={btnGhostIcon}
                                          title="Historie změn"
                                          aria-label="Historie změn"
                                        >
                                          <HistoryIcon
                                            className="size-4"
                                            aria-hidden="true"
                                          />
                                        </Button>
                                      }
                                    />
                                    <div
                                      className="flex items-center gap-1"
                                      title="Poslat e-mail"
                                      aria-label="Poslat e-mail"
                                    >
                                      <SendEmailButton
                                        id={e.id}
                                        kind="offboarding"
                                        email={e.userEmail ?? undefined}
                                        onDone={() => void reload()}
                                        onEditRequest={() =>
                                          void openEditDialog(e, "actual")
                                        }
                                        className={btnGhostIcon}
                                      />
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={btnSm}
                                      title="Upravit záznam"
                                      onClick={() =>
                                        void openEditDialog(e, "actual")
                                      }
                                    >
                                      Upravit
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Potvrdit skutečný odchod ---------- */}
      <Dialog
        open={openActual}
        onOpenChange={(o) => {
          setOpenActual(o)
          if (!o) {
            setActiveRow(null)
            setActualEndInput("")
          }
        }}
      >
        <DialogContent className="max-w-3xl p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný odchod
          </DialogTitle>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            {activeRow && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">Souhlasí ostatní údaje?</p>
                  <div className="grid gap-y-1 md:grid-cols-2">
                    <div>
                      <strong>Jméno:</strong>{" "}
                      {[
                        activeRow.titleBefore,
                        activeRow.name,
                        activeRow.surname,
                        activeRow.titleAfter,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div>
                      <strong>Pozice:</strong> {activeRow.positionName}
                    </div>
                    <div>
                      <strong>Odbor:</strong> {activeRow.department}
                    </div>
                    <div>
                      <strong>Oddělení:</strong> {activeRow.unitName}
                    </div>
                    <div className="md:col-span-2">
                      <strong>Poznámka:</strong> {activeRow.notes ?? "–"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="inline-flex items-center justify-center gap-2"
                      title="Otevřít formulář k úpravě"
                      onClick={() => {
                        setOpenActual(false)
                        void openEditDialog(activeRow, "planned")
                      }}
                    >
                      Nesouhlasí – upravit formulář
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
                  <label className="mb-1 block font-medium">
                    Datum skutečného odchodu
                  </label>
                  <div className="flex items-center gap-3">
                    <Input
                      type="date"
                      value={actualEndInput}
                      onChange={(e) => setActualEndInput(e.target.value)}
                      className="max-w-[220px]"
                    />
                    <Button
                      size="sm"
                      className="inline-flex items-center justify-center gap-2 bg-amber-600 text-white hover:bg-amber-700"
                      title="Potvrdit skutečný odchod"
                      onClick={() => void confirmDepartureWithInput()}
                      disabled={!actualEndInput}
                    >
                      Souhlasí, potvrdit odchod
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Edit ---------- */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-4xl p-0">
          <DialogTitle className="px-6 pt-6">Upravit záznam</DialogTitle>
          <div className="max-h-[80vh] overflow-y-auto p-6">
            {editLoading && (
              <p className="px-1 text-sm text-muted-foreground">Načítám…</p>
            )}
            {editId != null && editInitial && (
              <OffboardingFormUnified
                key={`edit-${editId}-${editContext}`}
                positions={positions}
                id={editId}
                initial={editInitial}
                defaultCreateMode="edit"
                editContext={editContext}
                onSuccess={async () => {
                  setOpenEdit(false)
                  setEditId(null)
                  setEditInitial(null)
                  await reload()
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
