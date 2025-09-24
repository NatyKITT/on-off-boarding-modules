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
import { OnboardingFormUnified } from "@/components/forms/onboarding-form"
import { DeletedPlannedDialog } from "@/components/history/deleted-planned-dialog"
import { HistoryDialog } from "@/components/history/history-dialog"

type Employee = {
  id: number
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
  email?: string | null
  department: string
  unitName: string
  positionNum: string
  positionName: string
  plannedStart: string
  actualStart?: string | null
  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

export default function OnboardingPage() {
  const sp = useSearchParams()

  const [planned, setPlanned] = useState<Employee[]>([])
  const [actual, setActual] = useState<Employee[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  // nové záznamy
  const [openNewPlanned, setOpenNewPlanned] = useState(false)
  const [openNewActual, setOpenNewActual] = useState(false)

  // potvrzení „Nastoupil“
  const [openConfirm, setOpenConfirm] = useState(false)
  const [confirmRow, setConfirmRow] = useState<Employee | null>(null)
  const [confirmActualStart, setConfirmActualStart] = useState("")
  const [confirmUserEmail, setConfirmUserEmail] = useState("")
  const [confirmUserName, setConfirmUserName] = useState("")
  const [confirmEvidence, setConfirmEvidence] = useState("")
  const [confirmNotes, setConfirmNotes] = useState("")

  // editace
  const [openEdit, setOpenEdit] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [editInitial, setEditInitial] = useState<Partial<Employee> | null>(null)
  const [editContext, setEditContext] = useState<"planned" | "actual">(
    "planned"
  )
  const [editLoading, setEditLoading] = useState(false)

  const qpMode = sp.get("new") as "create-planned" | "create-actual" | null
  const qpDate = sp.get("date") || undefined

  function normalizePositionsPayload(payload: unknown): Position[] {
    if (!Array.isArray(payload)) return []
    return payload
      .map((p) => {
        const o = p as Partial<Position> & {
          id?: string | number
          num?: unknown
          name?: unknown
          dept_name?: unknown
          unit_name?: unknown
        }
        if (!o?.num) return null
        return {
          id: String(o.id ?? o.num),
          num: String(o.num),
          name: typeof o.name === "string" ? o.name : "",
          dept_name: typeof o.dept_name === "string" ? o.dept_name : "",
          unit_name: typeof o.unit_name === "string" ? o.unit_name : "",
        } as Position
      })
      .filter(Boolean) as Position[]
  }

  async function reload() {
    setLoading(true)
    try {
      const [posRes, onbRes] = await Promise.all([
        fetch("/api/systematizace", { cache: "no-store" }),
        fetch("/api/nastupy", { cache: "no-store" }),
      ])
      const posJson = await posRes.json().catch(() => null)
      const onbJson = await onbRes.json().catch(() => null)

      setPositions(
        normalizePositionsPayload(
          Array.isArray(posJson?.data) ? posJson.data : []
        )
      )

      if (onbJson?.status === "success" && Array.isArray(onbJson.data)) {
        const rows = onbJson.data as Employee[]
        setPlanned(rows.filter((e) => !e.actualStart))
        setActual(rows.filter((e) => !!e.actualStart))
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
    window.addEventListener("onboarding:deleted", handler)
    return () => window.removeEventListener("onboarding:deleted", handler)
  }, [])

  const thisMonth = format(new Date(), "yyyy-MM")
  const defaultPlannedMonth = useMemo(() => {
    const has = planned.find((e) => e.plannedStart?.slice(0, 7) === thisMonth)
    return (
      has?.plannedStart?.slice(0, 7) ??
      planned[0]?.plannedStart?.slice(0, 7) ??
      ""
    )
  }, [planned, thisMonth])

  const actualMonths = useMemo(
    () =>
      Array.from(
        new Set(
          actual
            .filter((e) => !!e.actualStart)
            .map((e) => e.actualStart!.slice(0, 7))
        )
      ),
    [actual]
  )

  const defaultActualMonth = useMemo(() => {
    const has = actual.find((e) => e.actualStart?.slice(0, 7) === thisMonth)
    return has?.actualStart?.slice(0, 7) ?? actualMonths[0] ?? ""
  }, [actual, actualMonths, thisMonth])

  function openConfirmFromPlanned(e: Employee) {
    setConfirmRow(e)
    setConfirmActualStart(e.plannedStart?.slice(0, 10) ?? "")
    setConfirmUserEmail(e.userEmail ?? "")
    setConfirmUserName(e.userName ?? "")
    setConfirmEvidence(e.personalNumber ?? "")
    setConfirmNotes(e.notes ?? "")
    setOpenConfirm(true)
  }

  async function confirmActual() {
    if (!confirmRow) return
    if (!confirmActualStart) return alert("Vyplňte datum skutečného nástupu.")
    try {
      const res = await fetch(`/api/nastupy/${confirmRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStart: confirmActualStart,
          userEmail: confirmUserEmail.trim() || null,
          userName: confirmUserName.trim() || null,
          personalNumber: confirmEvidence.trim() || null,
          notes: confirmNotes.trim() || null,
          status: "COMPLETED",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Potvrzení nástupu se nezdařilo.")
      }
      setOpenConfirm(false)
      setConfirmRow(null)
      setConfirmActualStart("")
      setConfirmUserEmail("")
      setConfirmUserName("")
      setConfirmEvidence("")
      setConfirmNotes("")
      await reload()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Potvrzení nástupu se nezdařilo.")
    }
  }

  async function openEditDialog(id: number, ctx: "planned" | "actual") {
    setEditContext(ctx)
    setEditLoading(true)
    setEditId(id)

    if (!positions.length) {
      try {
        const posRes = await fetch("/api/systematizace", { cache: "no-store" })
        const posJson = await posRes.json().catch(() => null)
        setPositions(
          normalizePositionsPayload(
            Array.isArray(posJson?.data) ? posJson.data : []
          )
        )
      } catch {}
    }

    try {
      const res = await fetch(`/api/nastupy/${id}`, { cache: "no-store" })
      if (!res.ok) throw new Error("Fetch failed")
      const json = await res.json()
      const d = json?.data as Employee
      setEditInitial({
        titleBefore: d.titleBefore ?? "",
        name: d.name,
        surname: d.surname,
        titleAfter: d.titleAfter ?? "",
        email: d.email ?? "",
        positionNum: d.positionNum,
        positionName: d.positionName,
        department: d.department,
        unitName: d.unitName,
        plannedStart: d.plannedStart?.slice(0, 10),
        actualStart: d.actualStart?.slice(0, 10),
        userName: d.userName ?? "",
        userEmail: d.userEmail ?? "",
        personalNumber: d.personalNumber ?? "",
        notes: d.notes ?? "",
        status: d.status,
      })
      setOpenEdit(true)
    } catch {
      setEditInitial(null)
      alert("Nepodařilo se načíst data záznamu.")
    } finally {
      setEditLoading(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="mb-4 text-2xl font-bold">Nástupy zaměstnanců</h1>

      <Tabs defaultValue="planned">
        <TabsList>
          <TabsTrigger value="planned">Předpokládané</TabsTrigger>
          <TabsTrigger value="actual">Skutečné</TabsTrigger>
        </TabsList>

        {/* ---------- PLANNED ---------- */}
        <TabsContent value="planned">
          <div className="mb-4 flex items-center justify-between">
            {/* Přidat planned */}
            <Dialog open={openNewPlanned} onOpenChange={setOpenNewPlanned}>
              <DialogTrigger asChild>
                <Button onClick={() => setOpenNewPlanned(true)}>
                  Přidat předpokládaný nástup
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
                <DialogTitle className="px-6 pt-6">
                  Nový předpokládaný nástup
                </DialogTitle>
                <div className="max-h-[80vh] overflow-y-auto p-6">
                  <OnboardingFormUnified
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

            {/* Smazané planned – nahoře vpravo */}
            <DeletedPlannedDialog
              kind="onboarding"
              title="Smazané předpokládané nástupy"
              successEvent="onboarding:deleted"
              restoreButtonClassName="bg-blue-600 text-white hover:bg-blue-700"
              triggerLabel="Smazané záznamy"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : planned.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné předpokládané nástupy.
            </p>
          ) : (
            <Accordion
              type="multiple"
              defaultValue={defaultPlannedMonth ? [defaultPlannedMonth] : []}
            >
              {[...new Set(planned.map((e) => e.plannedStart.slice(0, 7)))].map(
                (month) => (
                  <AccordionItem
                    key={month}
                    value={month}
                    className="rounded-xl border"
                    style={{ backgroundColor: "#3b82f61A" }}
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
                                <TableHead>Předpokládaný nástup</TableHead>
                                <TableHead>E-mail</TableHead>
                                <TableHead className="text-right">
                                  Akce
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {planned
                                .filter((e) => e.plannedStart.startsWith(month))
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
                                        new Date(e.plannedStart),
                                        "d.M.yyyy"
                                      )}
                                    </TableCell>
                                    <TableCell>{e.email ?? "–"}</TableCell>
                                    <TableCell className="flex justify-end gap-2">
                                      <HistoryDialog
                                        id={e.id}
                                        kind="onboarding"
                                        trigger={
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            title="Historie změn"
                                            aria-label="Historie změn"
                                          >
                                            <HistoryIcon
                                              className="mr-1 size-4"
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
                                          kind="onboarding"
                                          email={e.email ?? undefined}
                                          onDone={() => void reload()}
                                          onEditRequest={() =>
                                            void openEditDialog(e.id, "planned")
                                          }
                                          className="p-0"
                                        />
                                      </div>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        title="Upravit záznam"
                                        onClick={() =>
                                          void openEditDialog(e.id, "planned")
                                        }
                                      >
                                        Upravit
                                      </Button>
                                      <Button
                                        size="sm"
                                        title="Potvrdit skutečný nástup"
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        onClick={() =>
                                          openConfirmFromPlanned(e)
                                        }
                                      >
                                        Nastoupil
                                      </Button>

                                      <div
                                        title="Smazat záznam"
                                        aria-label="Smazat záznam"
                                      >
                                        <ConfirmDeleteButton
                                          size="sm"
                                          endpoint={`/api/nastupy/${e.id}`}
                                          successEvent="onboarding:deleted"
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
                <Button onClick={() => setOpenNewActual(true)}>
                  Přidat skutečný nástup
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
                <DialogTitle className="px-6 pt-6">Skutečný nástup</DialogTitle>
                <div className="max-h-[80vh] overflow-y-auto p-6">
                  <OnboardingFormUnified
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
              className="bg-amber-600 text-white hover:bg-amber-700"
              onDone={() => void reload()}
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : actual.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Žádné skutečné nástupy.
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
                  style={{ backgroundColor: "#22c55e1A" }}
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
                              <TableHead>Skutečný nástup</TableHead>
                              <TableHead>Uživatelské jméno</TableHead>
                              <TableHead>Firemní účet</TableHead>
                              <TableHead className="text-right">Akce</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {actual
                              .filter((e) => e.actualStart?.startsWith(month))
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
                                      new Date(e.actualStart!),
                                      "d.M.yyyy"
                                    )}
                                  </TableCell>
                                  <TableCell>{e.userName ?? "–"}</TableCell>
                                  <TableCell>{e.userEmail ?? "–"}</TableCell>
                                  <TableCell className="flex justify-end gap-2">
                                    <HistoryDialog
                                      id={e.id}
                                      kind="onboarding"
                                      trigger={
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          title="Historie změn"
                                          aria-label="Historie změn"
                                        >
                                          <HistoryIcon
                                            className="mr-1 size-4"
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
                                        kind="onboarding"
                                        email={e.userEmail ?? undefined}
                                        onDone={() => void reload()}
                                        onEditRequest={() =>
                                          void openEditDialog(e.id, "actual")
                                        }
                                        className="p-0"
                                      />
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      title="Upravit záznam"
                                      onClick={() =>
                                        void openEditDialog(e.id, "actual")
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

      {/* ---------- Potvrdit skutečný nástup ---------- */}
      <Dialog
        open={openConfirm}
        onOpenChange={(o) => {
          setOpenConfirm(o)
          if (!o) {
            setConfirmRow(null)
            setConfirmActualStart("")
            setConfirmUserEmail("")
            setConfirmUserName("")
            setConfirmEvidence("")
            setConfirmNotes("")
          }
        }}
      >
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný nástup
          </DialogTitle>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            {confirmRow && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">Souhlasí ostatní údaje?</p>
                  <div className="grid gap-y-1 md:grid-cols-2">
                    <div>
                      <strong>Jméno:</strong>{" "}
                      {[
                        confirmRow.titleBefore,
                        confirmRow.name,
                        confirmRow.surname,
                        confirmRow.titleAfter,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div>
                      <strong>Pozice:</strong> {confirmRow.positionName}
                    </div>
                    <div>
                      <strong>Odbor:</strong> {confirmRow.department}
                    </div>
                    <div>
                      <strong>Oddělení:</strong> {confirmRow.unitName}
                    </div>
                    <div className="md:col-span-2">
                      <strong>Poznámka:</strong> {confirmRow.notes ?? "–"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      title="Otevřít formulář k úpravě"
                      onClick={() => {
                        setOpenConfirm(false)
                        void openEditDialog(confirmRow.id, "planned")
                      }}
                    >
                      Nesouhlasí – upravit formulář
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border bg-blue-50 p-3 text-sm dark:bg-blue-900/20">
                  <label className="mb-1 block font-medium">
                    Datum skutečného nástupu
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="date"
                      value={confirmActualStart}
                      onChange={(e) => setConfirmActualStart(e.target.value)}
                      className="max-w-[220px]"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Firemní e-mail
                      </label>
                      <Input
                        type="email"
                        value={confirmUserEmail}
                        onChange={(e) => setConfirmUserEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Uživatelské jméno
                      </label>
                      <Input
                        value={confirmUserName}
                        onChange={(e) => setConfirmUserName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Osobní číslo
                      </label>
                      <Input
                        value={confirmEvidence}
                        onChange={(e) => setConfirmEvidence(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium">
                        Poznámka
                      </label>
                      <Input
                        value={confirmNotes}
                        onChange={(e) => setConfirmNotes(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <Button
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                      title="Potvrdit skutečný nástup"
                      onClick={() => void confirmActual()}
                      disabled={!confirmActualStart}
                    >
                      Souhlasí, potvrdit nástup
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
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
          <DialogTitle className="px-6 pt-6">
            {editContext === "planned"
              ? "Upravit předpokládaný nástup"
              : "Upravit skutečný nástup"}
          </DialogTitle>
          {editLoading && (
            <p className="px-6 pt-2 text-sm text-muted-foreground">Načítám…</p>
          )}
          {editId != null && editInitial && (
            <div className="max-h-[80vh] overflow-y-auto p-6">
              <OnboardingFormUnified
                key={`${editId}-${editContext}`}
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
