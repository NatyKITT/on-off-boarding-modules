"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  addMinutes,
  format as dfFormat,
  getDay as dfGetDay,
  parse as dfParse,
  startOfWeek as dfStartOfWeek,
  setHours,
  setMinutes,
  startOfDay,
  startOfMonth,
} from "date-fns"
import { cs } from "date-fns/locale"
import { Calendar, dateFnsLocalizer, type View } from "react-big-calendar"

import "react-big-calendar/lib/css/react-big-calendar.css"

import MiniCalendar from "react-calendar"

import "react-calendar/dist/Calendar.css"

import { type Position } from "@/types/position"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  OffboardingFormUnified,
  type FormValues as OffFormValues,
} from "@/components/forms/offboarding-form"
import {
  OnboardingFormUnified,
  type FormValues as OnbFormValues,
} from "@/components/forms/onboarding-form"

/* ----------------------- Types ----------------------- */
type RCView = "month" | "year" | "decade" | "century"
type RCValue = Date | Date[] | null
type RCOnArgs = {
  action:
    | "prev"
    | "prev2"
    | "next"
    | "next2"
    | "drillDown"
    | "drillUp"
    | "onChange"
  activeStartDate: Date | null
  value: RCValue
  view: RCView
}
type RCTileArgs = { date: Date; view: RCView }

const localizer = dateFnsLocalizer({
  format: (date: Date, fmt: string) => dfFormat(date, fmt, { locale: cs }),
  parse: (dateString: string, fmt: string, ref: Date) =>
    dfParse(dateString, fmt, ref, { locale: cs }),
  startOfWeek: (date: Date) => dfStartOfWeek(date, { weekStartsOn: 1 }),
  getDay: (date: Date) => dfGetDay(date),
  locales: { cs },
})

type EventType = "plannedStart" | "actualStart" | "plannedEnd" | "actualEnd"
type EntityKind = "onb" | "off" | "cluster" | "combo"

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  type: EventType
  entity: EntityKind
  numericId: number
  clusterItems?: CalendarEvent[]
  hasCustomTime?: boolean
  comboTypes?: EventType[]
}

type OnbRow = {
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
  startTime?: string | null
  hasCustomDates?: boolean | null
  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

type OffRow = {
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
  plannedEnd: string
  actualEnd?: string | null
  noticeFiled?: string | null
  hasCustomDates?: boolean | null
  userName?: string | null
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

const COLORS: Record<EventType, string> = {
  plannedStart: "#3b82f6",
  actualStart: "#22c55e",
  plannedEnd: "#f97316",
  actualEnd: "#ef4444",
}

const TYPE_LABEL: Record<EventType, string> = {
  plannedStart: "Plánovaný nástup",
  actualStart: "Skutečný nástup",
  plannedEnd: "Plánovaný odchod",
  actualEnd: "Skutečný odchod",
}

/* ----------------------- Utils ----------------------- */
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const toISO = (d: Date | null) =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : ""

const setToWorkStart = (d: Date) => setMinutes(setHours(new Date(d), 8), 0)

const withDefaultWorkTime = (d: Date) => {
  const nd = new Date(d)
  return nd.getHours() === 0 && nd.getMinutes() === 0 ? setToWorkStart(nd) : nd
}

const normalizeSlotStart = (d: Date) => {
  const n = new Date(d)
  if (n.getHours() === 0 && n.getMinutes() === 0) {
    n.setHours(8, 0, 0, 0)
  }
  return roundToHalfHourFloor(n)
}

const roundToHalfHourFloor = (d: Date) => {
  const n = new Date(d)
  n.setSeconds(0, 0)
  const m = n.getMinutes()
  n.setMinutes(m < 30 ? 0 : 30, 0, 0)
  return n
}

const slotKey = (d: Date) =>
  `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`

const toUndef = (v?: string | null) => (v == null ? undefined : v)

const mapOnbInitial = (e: Partial<OnbRow>): Partial<OnbFormValues> => ({
  titleBefore: toUndef(e.titleBefore),
  name: toUndef(e.name),
  surname: toUndef(e.surname),
  titleAfter: toUndef(e.titleAfter),
  email: toUndef(e.email),
  positionNum: toUndef(e.positionNum) ?? "",
  positionName: toUndef(e.positionName) ?? "",
  department: toUndef(e.department) ?? "",
  unitName: toUndef(e.unitName) ?? "",
  plannedStart: e.plannedStart ? e.plannedStart.slice(0, 10) : undefined,
  actualStart: e.actualStart ? e.actualStart.slice(0, 10) : undefined,
  startTime: toUndef(e.startTime),
  userEmail: toUndef(e.userEmail),
  userName: toUndef(e.userName),
  personalNumber: toUndef(e.personalNumber),
  notes: toUndef(e.notes),
})

const mapOffInitial = (e: Partial<OffRow>): Partial<OffFormValues> => ({
  titleBefore: toUndef(e.titleBefore),
  name: toUndef(e.name) ?? "",
  surname: toUndef(e.surname) ?? "",
  titleAfter: toUndef(e.titleAfter),
  personalNumber: toUndef(e.personalNumber) ?? "",
  positionNum: toUndef(e.positionNum) ?? "",
  positionName: toUndef(e.positionName) ?? "",
  department: toUndef(e.department) ?? "",
  unitName: toUndef(e.unitName) ?? "",
  userEmail: toUndef(e.userEmail),
  noticeFiled: e.noticeFiled ? e.noticeFiled.slice(0, 10) : undefined,
  hasCustomDates: e.hasCustomDates ?? undefined,
  plannedEnd: e.plannedEnd ? e.plannedEnd.slice(0, 10) : undefined,
  actualEnd: e.actualEnd ? e.actualEnd.slice(0, 10) : undefined,
  notes: toUndef(e.notes),
})

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/* ----------------------- Page ----------------------- */
export default function DashboardPage(): JSX.Element {
  // Shared dates/views
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [bigView, setBigView] = useState<View>("month")
  const [miniActiveStart, setMiniActiveStart] = useState<Date>(
    startOfMonth(new Date())
  )

  // Data
  const [positions, setPositions] = useState<Position[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [, setLoading] = useState(true)

  // Mini calendar selection
  const [miniSelected, setMiniSelected] = useState<Date | null>(null)

  // Refs
  const miniCalRef = useRef<HTMLDivElement>(null)
  const bigRef = useRef<HTMLDivElement>(null)

  // Slot creation
  const [slotDate, setSlotDate] = useState<Date | null>(null)
  const [planOpen, setPlanOpen] = useState(false)

  // Create modals
  const [openNewOnbPlanned, setOpenNewOnbPlanned] = useState(false)
  const [openNewOnbActual, setOpenNewOnbActual] = useState(false)
  const [openNewOffPlanned, setOpenNewOffPlanned] = useState(false)
  const [openNewOffActual, setOpenNewOffActual] = useState(false)

  // Edit modal
  const [openEdit, setOpenEdit] = useState(false)
  const [editType, setEditType] = useState<"onb" | "off">("onb")
  const [editContext, setEditContext] = useState<"planned" | "actual">(
    "planned"
  )
  const [editId, setEditId] = useState<number | null>(null)
  const [editInitial, setEditInitial] = useState<Partial<
    OnbRow & OffRow
  > | null>(null)

  // Confirm modals
  const [openConfirmOnb, setOpenConfirmOnb] = useState(false)
  const [openConfirmOff, setOpenConfirmOff] = useState(false)
  const [confirmOnbRow, setConfirmOnbRow] = useState<OnbRow | null>(null)
  const [confirmOffRow, setConfirmOffRow] = useState<OffRow | null>(null)
  // Onb confirm inline inputs
  const [onbActualStart, setOnbActualStart] = useState("")
  const [onbUserEmail, setOnbUserEmail] = useState("")
  const [onbUserName, setOnbUserName] = useState("")
  const [onbEvidence, setOnbEvidence] = useState("")
  const [onbNotes, setOnbNotes] = useState("")
  // Off confirm inline inputs
  const [offActualEnd, setOffActualEnd] = useState("")
  const [offUserEmail, setOffUserEmail] = useState("")
  const [offUserName, setOffUserName] = useState("")
  const [offEvidence, setOffEvidence] = useState("")
  const [offNotes, setOffNotes] = useState("")

  // First load
  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const [posRes, onbRes, offRes] = await Promise.all([
          fetch("/api/systematizace", { cache: "no-store" }),
          fetch("/api/nastupy", { cache: "no-store" }),
          fetch("/api/odchody", { cache: "no-store" }),
        ])

        const posJson = await posRes.json()
        setPositions(Array.isArray(posJson.data) ? posJson.data : [])

        const onbJson: { status: string; data?: OnbRow[] } = await onbRes.json()
        const offJson: { status: string; data?: OffRow[] } = await offRes.json()

        const onbEvents: CalendarEvent[] = (
          onbJson.data ?? []
        ).flatMap<CalendarEvent>((e) => {
          const full =
            `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`
              .replace(/\s+/g, " ")
              .trim()
          const makeDate = (iso?: string | null) => {
            const base = iso ? new Date(iso) : new Date()
            if (e.startTime) {
              const [h = "0", m = "0"] = (e.startTime ?? "00:00").split(":")
              base.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0)
            }
            return base
          }
          if (e.actualStart) {
            const d = makeDate(e.actualStart)
            return [
              {
                id: `onb-${e.id}`,
                numericId: e.id,
                title: full,
                start: d,
                end: d,
                type: "actualStart",
                entity: "onb",
                hasCustomTime: !!e.startTime,
              },
            ]
          }
          if (e.plannedStart) {
            const d = makeDate(e.plannedStart)
            return [
              {
                id: `onb-${e.id}`,
                numericId: e.id,
                title: full,
                start: d,
                end: d,
                type: "plannedStart",
                entity: "onb",
                hasCustomTime: !!e.startTime,
              },
            ]
          }
          return []
        })

        const offEvents: CalendarEvent[] = (
          offJson.data ?? []
        ).flatMap<CalendarEvent>((e) => {
          const full =
            `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`
              .replace(/\s+/g, " ")
              .trim()
          const out: CalendarEvent[] = []
          if (e.actualEnd) {
            const d = new Date(e.actualEnd)
            out.push({
              id: `off-${e.id}`,
              numericId: e.id,
              title: full,
              start: d,
              end: d,
              type: "actualEnd",
              entity: "off",
            })
          } else if (e.plannedEnd) {
            const d = new Date(e.plannedEnd)
            out.push({
              id: `off-${e.id}`,
              numericId: e.id,
              title: full,
              start: d,
              end: d,
              type: "plannedEnd",
              entity: "off",
            })
          }
          return out
        })

        setEvents([...onbEvents, ...offEvents])
      } catch (e) {
        console.error("Chyba při načítání přehledu:", e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null
      if (
        target &&
        miniCalRef.current &&
        !miniCalRef.current.contains(target)
      ) {
        setMiniSelected(null)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const handleBigNavigate = useCallback((date: Date) => {
    setCurrentDate(date)
    setMiniActiveStart(startOfMonth(date))
  }, [])
  const handleBigView = useCallback((view: View) => setBigView(view), [])

  const handleMiniActiveChange = useCallback((args: RCOnArgs) => {
    if (args.activeStartDate) {
      setMiniActiveStart(args.activeStartDate)
      setCurrentDate(args.activeStartDate)
    }
  }, [])
  const handleMiniChange = useCallback((value: RCValue) => {
    const date = Array.isArray(value) ? value[0] : value
    if (date) {
      setMiniSelected(date)
      setCurrentDate(date)
      setBigView("day")
    }
  }, [])

  const SLOT_LEN_MIN = 30
  const CLUSTER_THRESHOLD = 2

  const displayEvents = useMemo<CalendarEvent[]>(() => {
    if (bigView === "month") {
      // Měsíční pohled - clustering podle typu
      const perDay = new Map<string, Map<EventType, CalendarEvent[]>>()
      for (const ev of events) {
        const k = dayKey(ev.start)
        if (!perDay.has(k)) perDay.set(k, new Map())
        const dayMap = perDay.get(k)!
        const typeList = dayMap.get(ev.type)
        if (typeList) typeList.push(ev)
        else dayMap.set(ev.type, [ev])
      }
      const out: CalendarEvent[] = []
      perDay.forEach((typeMap, day) => {
        typeMap.forEach((items, type) => {
          if (items.length >= CLUSTER_THRESHOLD) {
            const sample = items[0]!
            out.push({
              id: `cluster-month-${day}-${type}`,
              title: `${items.length} × ${TYPE_LABEL[type]}`,
              start: sample.start,
              end: sample.end,
              type: sample.type,
              entity: "cluster",
              numericId: -1,
              clusterItems: items,
            })
          } else {
            out.push(...items)
          }
        })
      })
      return out
    }

    if (bigView === "week" || bigView === "day") {
      const out: CalendarEvent[] = []
      const perDay = new Map<string, CalendarEvent[]>()

      for (const ev of events) {
        const k = dayKey(ev.start)
        const list = perDay.get(k)
        list ? list.push(ev) : perDay.set(k, [ev])
      }

      perDay.forEach((dayEvents) => {
        const slots = new Map<string, Map<EventType, CalendarEvent[]>>()

        // Zpracuj nástupy (onboarding)
        const onbEvents = dayEvents.filter((e) => e.entity === "onb")
        onbEvents.forEach((ev) => {
          const slotStart = normalizeSlotStart(ev.start)
          const key = slotKey(slotStart)

          if (!slots.has(key)) slots.set(key, new Map())
          const typeMap = slots.get(key)!
          if (!typeMap.has(ev.type)) typeMap.set(ev.type, [])

          typeMap.get(ev.type)!.push({
            ...ev,
            start: slotStart,
            end: addMinutes(slotStart, SLOT_LEN_MIN),
          })
        })

        // Najdi obsazené sloty nástupy
        const occupiedSlots = new Set<string>()
        slots.forEach((_, key) => occupiedSlots.add(key))

        // Zpracuj odchody (offboarding) - řaď na další volné sloty
        const offEvents = dayEvents.filter((e) => e.entity === "off")
        let currentH = 8
        let currentM = 0

        offEvents.forEach((ev) => {
          // Najdi další volný slot
          while (
            occupiedSlots.has(
              `${currentH}:${String(currentM).padStart(2, "0")}`
            ) &&
            currentH < 18
          ) {
            currentM += 30
            if (currentM >= 60) {
              currentH++
              currentM = 0
            }
          }

          if (currentH >= 18) {
            // Reset pokud jsme za pracovní dobou
            currentH = 8
            currentM = 0
            while (
              occupiedSlots.has(
                `${currentH}:${String(currentM).padStart(2, "0")}`
              )
            ) {
              currentM += 30
              if (currentM >= 60) {
                currentH++
                currentM = 0
              }
            }
          }

          const slotStart = setMinutes(
            setHours(startOfDay(ev.start), currentH),
            currentM
          )
          const key = slotKey(slotStart)

          if (!slots.has(key)) slots.set(key, new Map())
          const typeMap = slots.get(key)!
          if (!typeMap.has(ev.type)) typeMap.set(ev.type, [])

          typeMap.get(ev.type)!.push({
            ...ev,
            start: slotStart,
            end: addMinutes(slotStart, SLOT_LEN_MIN),
          })

          occupiedSlots.add(key)
          currentM += 30
          if (currentM >= 60) {
            currentH++
            currentM = 0
          }
        })

        // Vytvoř výstupní události
        slots.forEach((typeMap) => {
          const plannedStart = typeMap.get("plannedStart") ?? []
          const actualStart = typeMap.get("actualStart") ?? []
          const plannedEnd = typeMap.get("plannedEnd") ?? []
          const actualEnd = typeMap.get("actualEnd") ?? []

          // Pro týdenní pohled - kombinuj nástupy
          if (
            bigView === "week" &&
            (plannedStart.length > 0 || actualStart.length > 0)
          ) {
            const allStarts = [...plannedStart, ...actualStart]
            if (allStarts.length >= CLUSTER_THRESHOLD) {
              const sample = allStarts[0]!
              if (plannedStart.length > 0 && actualStart.length > 0) {
                // Kombinovaný cluster
                out.push({
                  id: `combo-${dayKey(sample.start)}-${slotKey(sample.start)}`,
                  title: `${plannedStart.length}× Předpokl. + ${actualStart.length}× Skutečný`,
                  start: sample.start,
                  end: sample.end,
                  type: "actualStart",
                  entity: "combo",
                  numericId: -1,
                  clusterItems: allStarts,
                  comboTypes: ["plannedStart", "actualStart"],
                })
              } else {
                // Jednotypový cluster
                const type =
                  plannedStart.length > 0 ? "plannedStart" : "actualStart"
                out.push({
                  id: `cluster-${dayKey(sample.start)}-${slotKey(sample.start)}-${type}`,
                  title: `${allStarts.length} × ${TYPE_LABEL[type]}`,
                  start: sample.start,
                  end: sample.end,
                  type,
                  entity: "cluster",
                  numericId: -1,
                  clusterItems: allStarts,
                })
              }
            } else {
              out.push(...allStarts)
            }
          } else {
            // Pro denní pohled nebo jednotlivé události

            // Plánované nástupy
            if (plannedStart.length >= CLUSTER_THRESHOLD) {
              const sample = plannedStart[0]!
              out.push({
                id: `cluster-${dayKey(sample.start)}-${slotKey(sample.start)}-plannedStart`,
                title: `${plannedStart.length} × Plánovaný nástup`,
                start: sample.start,
                end: sample.end,
                type: "plannedStart",
                entity: "cluster",
                numericId: -1,
                clusterItems: plannedStart,
              })
            } else {
              out.push(...plannedStart)
            }

            // Skutečné nástupy
            if (actualStart.length >= CLUSTER_THRESHOLD) {
              const sample = actualStart[0]!
              out.push({
                id: `cluster-${dayKey(sample.start)}-${slotKey(sample.start)}-actualStart`,
                title: `${actualStart.length} × Skutečný nástup`,
                start: sample.start,
                end: sample.end,
                type: "actualStart",
                entity: "cluster",
                numericId: -1,
                clusterItems: actualStart,
              })
            } else {
              out.push(...actualStart)
            }
          }

          // Odchody - vždy samostatně
          if (plannedEnd.length >= CLUSTER_THRESHOLD) {
            const sample = plannedEnd[0]!
            out.push({
              id: `cluster-${dayKey(sample.start)}-${slotKey(sample.start)}-plannedEnd`,
              title: `${plannedEnd.length} × Plánovaný odchod`,
              start: sample.start,
              end: sample.end,
              type: "plannedEnd",
              entity: "cluster",
              numericId: -1,
              clusterItems: plannedEnd,
            })
          } else {
            out.push(...plannedEnd)
          }

          if (actualEnd.length >= CLUSTER_THRESHOLD) {
            const sample = actualEnd[0]!
            out.push({
              id: `cluster-${dayKey(sample.start)}-${slotKey(sample.start)}-actualEnd`,
              title: `${actualEnd.length} × Skutečný odchod`,
              start: sample.start,
              end: sample.end,
              type: "actualEnd",
              entity: "cluster",
              numericId: -1,
              clusterItems: actualEnd,
            })
          } else {
            out.push(...actualEnd)
          }
        })
      })

      return out
    }

    // Ostatní pohledy (agenda atd.)
    const groups = new Map<string, CalendarEvent[]>()
    for (const ev of events) {
      const k = dayKey(ev.start)
      const arr = groups.get(k)
      if (arr) arr.push(ev)
      else groups.set(k, [ev])
    }

    const out: CalendarEvent[] = []
    groups.forEach((list) => {
      if (!list.length) return
      const baseDay = list[0]!.start
      const slotBase = setMinutes(setHours(startOfDay(baseDay), 8), 0)

      const hasOnbTime = (e: CalendarEvent) =>
        e.entity === "onb" && e.start.getHours() + e.start.getMinutes() > 0

      const withTimeOnb = list.filter(hasOnbTime)
      const noTimeOnb = list.filter((e) => e.entity === "onb" && !hasOnbTime(e))
      const noTimeOff = list.filter((e) => e.entity === "off")

      const byTimeName = (a: CalendarEvent, b: CalendarEvent) =>
        a.start.getTime() - b.start.getTime() ||
        a.title.localeCompare(b.title, "cs")

      withTimeOnb.sort(byTimeName)
      noTimeOnb.sort((a, b) => a.title.localeCompare(b.title, "cs"))
      noTimeOff.sort((a, b) => a.title.localeCompare(b.title, "cs"))

      const ordered = [...withTimeOnb, ...noTimeOnb, ...noTimeOff]
      ordered.forEach((item, idx) => {
        const start = addMinutes(slotBase, idx * SLOT_LEN_MIN)
        const end = addMinutes(start, SLOT_LEN_MIN)
        out.push({ ...item, start, end })
      })
    })
    return out
  }, [events, bigView])

  const messages = useMemo(
    () => ({
      date: "Datum",
      time: "Čas",
      event: "Událost",
      allDay: "Celý den",
      week: "Týden",
      work_week: "Pracovní týden",
      day: "Den",
      month: "Měsíc",
      previous: "Předchozí",
      next: "Další",
      yesterday: "Včera",
      tomorrow: "Zítra",
      today: "Dnes",
      agenda: "Agenda",
      showMore: (total: number) => `+${total} více`,
      noEventsInRange: "Žádné události v tomto rozsahu.",
    }),
    []
  )

  const formats = useMemo(
    () => ({
      monthHeaderFormat: (date: Date) =>
        dfFormat(date, "LLLL yyyy", { locale: cs }),
      dayHeaderFormat: (date: Date) =>
        dfFormat(date, "EEEE d. LLLL", { locale: cs }),
      dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
        `${dfFormat(start, "d. LLLL", { locale: cs })} – ${dfFormat(end, "d. LLLL yyyy", { locale: cs })}`,
      weekdayFormat: (date: Date) => dfFormat(date, "EEEE", { locale: cs }),
      dayFormat: (date: Date) => dfFormat(date, "EEEE d.", { locale: cs }),
      eventTimeRangeFormat: () => "",
      agendaTimeRangeFormat: () => "",
    }),
    []
  )

  const minTime = useMemo(() => new Date(1970, 0, 1, 8, 0, 0), [])
  const maxTime = useMemo(() => new Date(1970, 0, 1, 18, 0, 0), [])

  const handleSelectSlot = useCallback(
    ({ start }: { start: Date }) => {
      const isMidnight = start.getHours() === 0 && start.getMinutes() === 0
      const normalized =
        bigView === "month" || isMidnight ? setToWorkStart(start) : start
      setSlotDate(normalized)
      setPlanOpen(true)
    },
    [bigView]
  )

  const openCreate = useCallback(
    (target: "onb-planned" | "onb-actual" | "off-planned" | "off-actual") => {
      if (!slotDate) return
      setPlanOpen(false)
      setTimeout(() => {
        switch (target) {
          case "onb-planned":
            setOpenNewOnbPlanned(true)
            break
          case "onb-actual":
            setOpenNewOnbActual(true)
            break
          case "off-planned":
            setOpenNewOffPlanned(true)
            break
          case "off-actual":
            setOpenNewOffActual(true)
            break
        }
      }, 100)
    },
    [slotDate]
  )

  // Helpers: load details
  const fetchOnb = useCallback(async (id: number): Promise<OnbRow | null> => {
    try {
      const res = await fetch(`/api/nastupy/${id}`, { cache: "no-store" })
      if (!res.ok) return null
      const j = await res.json()
      return j?.data ?? null
    } catch {
      return null
    }
  }, [])
  const fetchOff = useCallback(async (id: number): Promise<OffRow | null> => {
    try {
      const res = await fetch(`/api/odchody/${id}`, { cache: "no-store" })
      if (!res.ok) return null
      const j = await res.json()
      return j?.data ?? null
    } catch {
      return null
    }
  }, [])

  const [clusterOpen, setClusterOpen] = useState(false)
  const [clusterItems, setClusterItems] = useState<CalendarEvent[] | null>(null)
  const [clusterSlotLabel, setClusterSlotLabel] = useState("")

  const onSelectEvent = useCallback(
    async (ev: CalendarEvent) => {
      if (
        (ev.entity === "cluster" || ev.entity === "combo") &&
        ev.clusterItems?.length
      ) {
        setClusterItems(ev.clusterItems)
        setClusterSlotLabel(dfFormat(ev.start, "d. M. yyyy HH:mm"))
        setClusterOpen(true)
        return
      }
      if (ev.entity === "onb") {
        const d = await fetchOnb(ev.numericId)
        if (!d) return alert("Nepodařilo se načíst záznam.")
        if (ev.type === "plannedStart") {
          setConfirmOnbRow(d)
          setOnbActualStart((d.plannedStart ?? "").slice(0, 10))
          setOnbUserEmail(d.userEmail ?? "")
          setOnbUserName(d.userName ?? "")
          setOnbEvidence(d.personalNumber ?? "")
          setOnbNotes(d.notes ?? "")
          setOpenConfirmOnb(true)
        } else {
          setEditType("onb")
          setEditContext("actual")
          setEditId(d.id)
          setEditInitial(d)
          setOpenEdit(true)
        }
      } else {
        const d = await fetchOff(ev.numericId)
        if (!d) return alert("Nepodařilo se načíst záznam.")
        if (ev.type === "plannedEnd") {
          setConfirmOffRow(d)
          setOffActualEnd((d.plannedEnd ?? "").slice(0, 10))
          setOffUserEmail(d.userEmail ?? "")
          setOffUserName(d.userName ?? "")
          setOffEvidence(d.personalNumber ?? "")
          setOffNotes(d.notes ?? "")
          setOpenConfirmOff(true)
        } else {
          setEditType("off")
          setEditContext("actual")
          setEditId(d.id)
          setEditInitial(d)
          setOpenEdit(true)
        }
      }
    },
    [fetchOnb, fetchOff]
  )

  const reloadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [onbRes, offRes] = await Promise.all([
        fetch("/api/nastupy", { cache: "no-store" }),
        fetch("/api/odchody", { cache: "no-store" }),
      ])
      const onbJson: { status: string; data?: OnbRow[] } = await onbRes.json()
      const offJson: { status: string; data?: OffRow[] } = await offRes.json()

      const onbEvents: CalendarEvent[] = (
        onbJson.data ?? []
      ).flatMap<CalendarEvent>((e) => {
        const full =
          `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`
            .replace(/\s+/g, " ")
            .trim()
        const makeDate = (iso?: string | null) => {
          const d = iso ? new Date(iso) : new Date()
          if (e.startTime) {
            const [h = "0", m = "0"] = (e.startTime ?? "00:00").split(":")
            d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0)
          }
          return d
        }
        if (e.actualStart) {
          const d = makeDate(e.actualStart)
          return [
            {
              id: `onb-${e.id}`,
              numericId: e.id,
              title: full,
              start: d,
              end: d,
              type: "actualStart",
              entity: "onb",
              hasCustomTime: !!e.startTime,
            },
          ]
        } else if (e.plannedStart) {
          const d = makeDate(e.plannedStart)
          return [
            {
              id: `onb-${e.id}`,
              numericId: e.id,
              title: full,
              start: d,
              end: d,
              type: "plannedStart",
              entity: "onb",
              hasCustomTime: !!e.startTime,
            },
          ]
        }
        return []
      })

      const offEvents: CalendarEvent[] = (
        offJson.data ?? []
      ).flatMap<CalendarEvent>((e) => {
        const full =
          `${e.titleBefore ?? ""} ${e.name} ${e.surname} ${e.titleAfter ?? ""}`
            .replace(/\s+/g, " ")
            .trim()
        const out: CalendarEvent[] = []
        if (e.actualEnd) {
          const d = new Date(e.actualEnd)
          out.push({
            id: `off-${e.id}`,
            numericId: e.id,
            title: full,
            start: d,
            end: d,
            type: "actualEnd",
            entity: "off",
          })
        } else if (e.plannedEnd) {
          const d = new Date(e.plannedEnd)
          out.push({
            id: `off-${e.id}`,
            numericId: e.id,
            title: full,
            start: d,
            end: d,
            type: "plannedEnd",
            entity: "off",
          })
        }
        return out
      })
      setEvents([...onbEvents, ...offEvents])
    } finally {
      setLoading(false)
    }
  }, [])

  const confirmOnboarding = useCallback(async () => {
    if (!confirmOnbRow) return
    if (!onbActualStart) return alert("Vyplňte datum skutečného nástupu.")
    try {
      const res = await fetch(`/api/nastupy/${confirmOnbRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualStart: onbActualStart,
          userEmail: onbUserEmail.trim() || undefined,
          userName: onbUserName.trim() || undefined,
          personalNumber: onbEvidence.trim() || undefined,
          notes: onbNotes.trim() || undefined,
          hasCustomDates: confirmOnbRow?.hasCustomDates ?? undefined,
          status: "COMPLETED",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Potvrzení nástupu se nezdařilo.")
      }
      setOpenConfirmOnb(false)
      setConfirmOnbRow(null)
      await reloadAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Potvrzení nástupu se nezdařilo.")
    }
  }, [
    confirmOnbRow,
    onbActualStart,
    onbUserEmail,
    onbUserName,
    onbEvidence,
    onbNotes,
    reloadAll,
  ])

  const confirmOffboarding = useCallback(async () => {
    if (!confirmOffRow) return
    if (!offActualEnd) return alert("Vyplňte datum skutečného odchodu.")
    try {
      const res = await fetch(`/api/odchody/${confirmOffRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actualEnd: offActualEnd,
          userEmail: offUserEmail.trim() || undefined,
          userName: offUserName.trim() || undefined,
          personalNumber: offEvidence.trim() || undefined,
          notes: offNotes.trim() || undefined,
          hasCustomDates: confirmOffRow?.hasCustomDates ?? undefined,
          status: "COMPLETED",
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.message ?? "Potvrzení odchodu se nezdařilo.")
      }
      setOpenConfirmOff(false)
      setConfirmOffRow(null)
      await reloadAll()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Potvrzení odchodu se nezdařilo.")
    }
  }, [
    confirmOffRow,
    offActualEnd,
    offUserEmail,
    offUserName,
    offEvidence,
    offNotes,
    reloadAll,
  ])

  // Mini calendar marker
  const miniTileContent = useCallback(
    ({ date, view }: RCTileArgs) => {
      if (view !== "month") return null
      const dayEvents = events.filter((e) => isSameDay(e.start, date))
      if (!dayEvents.length) return null
      const types: EventType[] = Array.from(
        new Set(dayEvents.map((e) => e.type))
      )
      const seg = 360 / types.length
      const stops = types
        .map((t, i) => `${COLORS[t]} ${i * seg}deg ${(i + 1) * seg}deg`)
        .join(", ")
      return (
        <span
          className="mini-marker"
          style={{ background: `conic-gradient(${stops})` }}
        />
      )
    },
    [events]
  )

  const getEventTooltip = useCallback((event: CalendarEvent) => {
    if (event.entity === "cluster" || event.entity === "combo") {
      return event.clusterItems?.map((e) => e.title).join(", ") || ""
    }
    const typeText = {
      plannedStart: "Předpokládaný nástup",
      actualStart: "Skutečný nástup",
      plannedEnd: "Plánovaný odchod",
      actualEnd: "Skutečný odchod",
    }[event.type]
    if (event.hasCustomTime) {
      const timeStr = dfFormat(event.start, "HH:mm", { locale: cs })
      return `${typeText} ${event.title} (${timeStr})`
    }
    return `${typeText} ${event.title}`
  }, [])

  const EventCell = useCallback(
    ({ event }: { event: CalendarEvent }) => {
      const fontSize =
        bigView === "month" ? "10px" : bigView === "week" ? "11px" : "12px"

      if (event.entity === "combo") {
        const plannedCount =
          event.clusterItems?.filter((e) => e.type === "plannedStart").length ??
          0
        const actualCount =
          event.clusterItems?.filter((e) => e.type === "actualStart").length ??
          0
        const tooltipText =
          event.clusterItems?.map((e) => e.title).join(", ") || ""

        return (
          <div
            className="rbc-event-inner"
            style={{
              fontWeight: 700,
              fontSize,
              lineHeight: 1.2,
              padding: "2px 4px",
            }}
            title={tooltipText}
          >
            {plannedCount > 0 && `${plannedCount}× Předpokl.`}
            {plannedCount > 0 && actualCount > 0 && " + "}
            {actualCount > 0 && `${actualCount}× Skutečný`}
          </div>
        )
      }

      if (event.entity === "cluster") {
        const tooltipText =
          event.clusterItems?.map((e) => e.title).join(", ") || ""
        return (
          <div
            className="rbc-event-inner"
            style={{
              fontWeight: 700,
              fontSize,
              lineHeight: 1.2,
              padding: "2px 4px",
            }}
            title={tooltipText}
          >
            {event.title}
          </div>
        )
      }

      const typeText = {
        plannedStart: "Předpokládaný nástup",
        actualStart: "Skutečný nástup",
        plannedEnd: "Plánovaný odchod",
        actualEnd: "Skutečný odchod",
      }[event.type]
      const tooltipText = event.hasCustomTime
        ? `${typeText}: ${event.title} (${dfFormat(event.start, "HH:mm", { locale: cs })})`
        : `${typeText}: ${event.title}`

      return (
        <div
          className="rbc-event-inner"
          style={{
            fontWeight: 700,
            fontSize,
            lineHeight: 1.2,
            padding: "2px 4px",
          }}
          title={tooltipText}
        >
          {event.title}
        </div>
      )
    },
    [bigView]
  )

  /* ----------------------- Render ----------------------- */
  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-6">
      {/* LEFT: Mini calendar */}
      <aside className="w-full shrink-0 rounded-2xl bg-white/90 p-3 shadow-md ring-1 ring-black/5 dark:bg-neutral-900 lg:w-[280px] lg:p-4">
        <div ref={miniCalRef}>
          <MiniCalendar
            locale="cs-CZ"
            calendarType="iso8601"
            prev2Label={null}
            next2Label={null}
            value={miniSelected}
            onChange={(value) => handleMiniChange(value as RCValue)}
            activeStartDate={miniActiveStart}
            onActiveStartDateChange={(payload) =>
              handleMiniActiveChange(payload as RCOnArgs)
            }
            tileClassName={({ date, view }) => {
              const classes: string[] = []
              if (view === "month") {
                const cur = miniActiveStart ?? startOfMonth(new Date())
                const inMonth =
                  date.getMonth() === cur.getMonth() &&
                  date.getFullYear() === cur.getFullYear()
                const dow = date.getDay()
                if (!inMonth)
                  classes.push(
                    dow === 0 || dow === 6
                      ? "mini-outside-weekend"
                      : "mini-outside"
                  )
                else if (dow === 0 || dow === 6) classes.push("mini-weekend")
                if (isSameDay(date, new Date())) classes.push("mini-today")
                if (miniSelected && isSameDay(date, miniSelected))
                  classes.push("mini-selected")
              }
              return classes.join(" ")
            }}
            tileContent={(args) => miniTileContent(args as RCTileArgs)}
          />
        </div>

        {/* Legend */}
        <div className="mt-4 space-y-2 text-xs lg:text-sm">
          <div className="mb-1 font-semibold">Legenda</div>
          <Legend color={COLORS.plannedStart} label="Plánovaný nástup" />
          <Legend color={COLORS.actualStart} label="Skutečný nástup" />
          <Legend color={COLORS.plannedEnd} label="Plánovaný odchod" />
          <Legend color={COLORS.actualEnd} label="Skutečný odchod" />
        </div>
      </aside>

      {/* RIGHT: Big calendar */}
      <section
        ref={bigRef}
        className="flex-1 overflow-hidden rounded-2xl bg-white p-3 shadow-lg ring-1 ring-black/5 dark:bg-neutral-900 lg:p-4"
      >
        <Calendar<CalendarEvent>
          localizer={localizer}
          events={displayEvents}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          selectable="ignoreEvents"
          onSelectSlot={handleSelectSlot}
          onSelectEvent={(e) => void onSelectEvent(e)}
          date={currentDate}
          view={bigView}
          onNavigate={handleBigNavigate}
          onView={handleBigView}
          messages={messages}
          formats={formats}
          views={["month", "week", "day"]}
          step={30}
          timeslots={2}
          min={minTime}
          max={maxTime}
          components={{ event: EventCell }}
          tooltipAccessor={null}
          eventPropGetter={(event) => {
            const bg = (() => {
              if (event.entity === "combo") {
                return `linear-gradient(90deg, ${COLORS.plannedStart} 0%, ${COLORS.plannedStart} 50%, ${COLORS.actualStart} 50%, ${COLORS.actualStart} 100%)`
              }
              return COLORS[event.type]
            })()

            return {
              style: {
                background: bg,
                color: "white",
                borderRadius: 8,
                border: "none",
                padding: bigView === "month" ? "4px 6px" : "6px 8px",
                boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                whiteSpace: "normal",
                wordBreak: "break-word",
                overflowWrap: "anywhere",
                lineHeight: 1.15,
                fontSize: bigView === "month" ? 10 : 11,
                fontWeight: 600,
                textShadow: "0 1px 1px rgba(0,0,0,0.25)",
                overflow: "visible",
                height: "auto",
                minHeight: bigView === "month" ? "24px" : "28px",
              },
            }
          }}
          style={{ height: "100%" }}
        />
      </section>

      {/* Slot planning modal */}
      {planOpen && (
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/40 p-4"
          onClick={() => setPlanOpen(false)}
        >
          <div
            className="w-full max-w-[460px] rounded-2xl bg-white p-5 text-neutral-800 shadow-xl ring-1 ring-black/5 dark:bg-neutral-900 dark:text-neutral-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 text-lg font-semibold">Naplánovat akci</h3>
            <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
              Datum:{" "}
              <strong>
                {dfFormat(slotDate ?? new Date(), "d. M. yyyy", { locale: cs })}
              </strong>
              , čas:{" "}
              <strong>
                {dfFormat(
                  slotDate
                    ? withDefaultWorkTime(slotDate)
                    : setToWorkStart(new Date()),
                  "HH:mm"
                )}
              </strong>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg px-3 py-2 text-white"
                style={{ background: COLORS.plannedStart }}
                onClick={() => openCreate("onb-planned")}
              >
                Předpokládaný nástup
              </button>
              <button
                className="rounded-lg px-3 py-2 text-white"
                style={{ background: COLORS.actualStart }}
                onClick={() => openCreate("onb-actual")}
              >
                Skutečný nástup
              </button>
              <button
                className="rounded-lg px-3 py-2 text-white"
                style={{ background: COLORS.plannedEnd }}
                onClick={() => openCreate("off-planned")}
              >
                Plánovaný odchod
              </button>
              <button
                className="rounded-lg px-3 py-2 text-white"
                style={{ background: COLORS.actualEnd }}
                onClick={() => openCreate("off-actual")}
              >
                Skutečný odchod
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/10"
                onClick={() => setPlanOpen(false)}
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modals */}
      <Dialog open={openNewOnbPlanned} onOpenChange={setOpenNewOnbPlanned}>
        <DialogContent className="z-[300] max-w-4xl p-6">
          <DialogTitle className="mb-4">Nový předpokládaný nástup</DialogTitle>
          <OnboardingFormUnified
            positions={positions}
            mode="create-planned"
            initial={{
              plannedStart: toISO(slotDate) || undefined,
              startTime: slotDate
                ? dfFormat(withDefaultWorkTime(slotDate), "HH:mm")
                : "08:00",
            }}
            onSuccess={async () => {
              setOpenNewOnbPlanned(false)
              await reloadAll()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOnbActual} onOpenChange={setOpenNewOnbActual}>
        <DialogContent className="z-[300] max-w-4xl p-6">
          <DialogTitle className="mb-4">Nový skutečný nástup</DialogTitle>
          <OnboardingFormUnified
            positions={positions}
            mode="create-actual"
            initial={{
              actualStart: toISO(slotDate) || undefined,
              startTime: slotDate
                ? dfFormat(withDefaultWorkTime(slotDate), "HH:mm")
                : "08:00",
            }}
            onSuccess={async () => {
              setOpenNewOnbActual(false)
              await reloadAll()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOffPlanned} onOpenChange={setOpenNewOffPlanned}>
        <DialogContent className="z-[300] max-w-4xl p-6">
          <DialogTitle className="mb-4">Nový plánovaný odchod</DialogTitle>
          <OffboardingFormUnified
            key={`new-off-planned-${toISO(slotDate) || "no-date"}`}
            mode="create-planned"
            prefillDate={toISO(slotDate) || undefined}
            initial={{ hasCustomDates: false }}
            onSuccess={async () => {
              setOpenNewOffPlanned(false)
              await reloadAll()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOffActual} onOpenChange={setOpenNewOffActual}>
        <DialogContent className="z-[300] max-w-4xl p-6">
          <DialogTitle className="mb-4">Nový skutečný odchod</DialogTitle>
          <OffboardingFormUnified
            key={`new-off-actual-${toISO(slotDate) || "no-date"}`}
            mode="create-actual"
            prefillDate={toISO(slotDate) || undefined}
            initial={{ hasCustomDates: false }}
            onSuccess={async () => {
              setOpenNewOffActual(false)
              await reloadAll()
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={clusterOpen} onOpenChange={setClusterOpen}>
        <DialogContent className="z-[300] max-w-md">
          <DialogTitle>Události ve slotu {clusterSlotLabel}</DialogTitle>
          <div className="mt-2 space-y-2">
            {clusterItems?.map((e) => (
              <button
                key={e.id}
                className="w-full rounded-md border px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  setClusterOpen(false)
                  void onSelectEvent({ ...e, entity: e.entity })
                }}
                title={getEventTooltip(e)}
              >
                <div className="font-semibold">{e.title}</div>
                <div className="text-xs opacity-80">
                  {dfFormat(e.start, "HH:mm")} •{" "}
                  {e.type === "plannedStart" && "Předpokládaný nástup"}
                  {e.type === "actualStart" && "Skutečný nástup"}
                  {e.type === "plannedEnd" && "Plánovaný odchod"}
                  {e.type === "actualEnd" && "Skutečný odchod"}
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm ONB */}
      <Dialog
        open={openConfirmOnb}
        onOpenChange={(o) => {
          setOpenConfirmOnb(o)
          if (!o) {
            setConfirmOnbRow(null)
            setOnbActualStart("")
            setOnbUserEmail("")
            setOnbUserName("")
            setOnbEvidence("")
            setOnbNotes("")
          }
        }}
      >
        <DialogContent className="z-[300] max-w-3xl overflow-hidden p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný nástup
          </DialogTitle>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            {confirmOnbRow && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">Souhlasí ostatní údaje?</p>
                  <div className="grid gap-y-1 md:grid-cols-2">
                    <div>
                      <strong>Jméno:</strong>{" "}
                      {`${confirmOnbRow.titleBefore ?? ""} ${confirmOnbRow.name} ${confirmOnbRow.surname} ${confirmOnbRow.titleAfter ?? ""}`
                        .replace(/\s+/g, " ")
                        .trim()}
                    </div>
                    <div>
                      <strong>Pozice:</strong> {confirmOnbRow.positionName}
                    </div>
                    <div>
                      <strong>Odbor:</strong> {confirmOnbRow.department}
                    </div>
                    <div>
                      <strong>Oddělení:</strong> {confirmOnbRow.unitName}
                    </div>
                    <div className="md:col-span-2">
                      <strong>Poznámka:</strong> {confirmOnbRow.notes ?? "–"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOpenConfirmOnb(false)
                        setEditType("onb")
                        setEditContext("planned")
                        setEditId(confirmOnbRow.id)
                        setEditInitial(confirmOnbRow)
                        setOpenEdit(true)
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
                      value={onbActualStart}
                      onChange={(e) => setOnbActualStart(e.target.value)}
                      className="max-w-[220px]"
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Firemní e-mail (nepovinné)
                      </label>
                      <Input
                        type="email"
                        value={onbUserEmail}
                        onChange={(e) => setOnbUserEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Uživatelské jméno (nepovinné)
                      </label>
                      <Input
                        value={onbUserName}
                        onChange={(e) => setOnbUserName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Osobní číslo (nepovinné)
                      </label>
                      <Input
                        value={onbEvidence}
                        onChange={(e) => setOnbEvidence(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium">
                        Poznámka (nepovinné)
                      </label>
                      <Textarea
                        value={onbNotes}
                        onChange={(e) => setOnbNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={() => void confirmOnboarding()}
                      disabled={!onbActualStart}
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

      {/* Confirm OFF */}
      <Dialog
        open={openConfirmOff}
        onOpenChange={(o) => {
          setOpenConfirmOff(o)
          if (!o) {
            setConfirmOffRow(null)
            setOffActualEnd("")
            setOffUserEmail("")
            setOffUserName("")
            setOffEvidence("")
            setOffNotes("")
          }
        }}
      >
        <DialogContent className="z-[300] max-w-3xl overflow-hidden p-0">
          <DialogTitle className="px-6 pt-6">
            Potvrdit skutečný odchod
          </DialogTitle>
          <div className="max-h-[80vh] space-y-4 overflow-y-auto p-6">
            {confirmOffRow && (
              <>
                <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                  <p className="mb-2 font-medium">Souhlasí ostatní údaje?</p>
                  <div className="grid gap-y-1 md:grid-cols-2">
                    <div>
                      <strong>Jméno:</strong>{" "}
                      {`${confirmOffRow.titleBefore ?? ""} ${confirmOffRow.name} ${confirmOffRow.surname} ${confirmOffRow.titleAfter ?? ""}`
                        .replace(/\s+/g, " ")
                        .trim()}
                    </div>
                    <div>
                      <strong>Pozice:</strong> {confirmOffRow.positionName}
                    </div>
                    <div>
                      <strong>Odbor:</strong> {confirmOffRow.department}
                    </div>
                    <div>
                      <strong>Oddělení:</strong> {confirmOffRow.unitName}
                    </div>
                    <div className="md:col-span-2">
                      <strong>Poznámka:</strong> {confirmOffRow.notes ?? "–"}
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOpenConfirmOff(false)
                        setEditType("off")
                        setEditContext("planned")
                        setEditId(confirmOffRow.id)
                        setEditInitial(confirmOffRow)
                        setOpenEdit(true)
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
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="date"
                      value={offActualEnd}
                      onChange={(e) => setOffActualEnd(e.target.value)}
                      className="max-w-[220px]"
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Firemní e-mail (nepovinné)
                      </label>
                      <Input
                        type="email"
                        value={offUserEmail}
                        onChange={(e) => setOffUserEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Uživatelské jméno (nepovinné)
                      </label>
                      <Input
                        value={offUserName}
                        onChange={(e) => setOffUserName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">
                        Osobní číslo (nepovinné)
                      </label>
                      <Input
                        value={offEvidence}
                        onChange={(e) => setOffEvidence(e.target.value)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium">
                        Poznámka (nepovinné)
                      </label>
                      <Textarea
                        value={offNotes}
                        onChange={(e) => setOffNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      size="sm"
                      onClick={() => void confirmOffboarding()}
                      disabled={!offActualEnd}
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

      {/* Edit (shared) */}
      <Dialog
        open={openEdit}
        onOpenChange={(o) => {
          setOpenEdit(o)
          if (!o) {
            setEditId(null)
            setEditInitial(null)
          }
        }}
      >
        <DialogContent className="z-[300] max-w-4xl p-6">
          <DialogTitle className="mb-4">Upravit záznam</DialogTitle>
          {editId != null && editInitial && (
            <div>
              {editType === "onb" ? (
                <OnboardingFormUnified
                  key={`edit-onb-${editId}-${editContext}`}
                  positions={positions}
                  id={editId}
                  mode="edit"
                  editContext={editContext}
                  initial={mapOnbInitial(editInitial as Partial<OnbRow>)}
                  onSuccess={async () => {
                    setOpenEdit(false)
                    setEditId(null)
                    setEditInitial(null)
                    await reloadAll()
                  }}
                />
              ) : (
                <OffboardingFormUnified
                  key={`edit-off-${editId}-${editContext}`}
                  id={editId}
                  mode="edit"
                  editContext={editContext}
                  initial={mapOffInitial(editInitial as Partial<OffRow>)}
                  onSuccess={async () => {
                    setOpenEdit(false)
                    setEditId(null)
                    setEditInitial(null)
                    await reloadAll()
                  }}
                />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Globální styly */}
      <style jsx global>{`
        /* MINI calendar skin */
        .react-calendar {
          border: none !important;
          background: transparent !important;
          font-family: inherit;
        }
        .react-calendar__navigation {
          margin-bottom: 6px;
        }
        .react-calendar__navigation button {
          border-radius: 8px;
          font-size: 14px;
        }
        @media (max-width: 1024px) {
          .react-calendar__navigation button {
            font-size: 12px;
            padding: 4px;
          }
        }
        .react-calendar__tile {
          position: relative;
          padding: 6px 0 !important;
          background: transparent !important;
          font-size: 14px;
        }
        @media (max-width: 1024px) {
          .react-calendar__tile {
            padding: 4px 0 !important;
            font-size: 12px;
          }
        }
        .react-calendar__tile:enabled:hover {
          background: rgba(0, 0, 0, 0.03) !important;
        }
        .react-calendar__tile--active,
        .react-calendar__tile--hasActive {
          background: transparent !important;
          color: inherit !important;
        }
        .react-calendar__month-view__weekdays {
          text-transform: none;
          font-size: 12px;
        }
        @media (max-width: 1024px) {
          .react-calendar__month-view__weekdays {
            font-size: 10px;
          }
        }
        .react-calendar__month-view__days__day abbr {
          position: relative;
          z-index: 2;
          display: inline-grid;
          place-items: center;
          min-width: 24px;
          min-height: 24px;
          border-radius: 6px;
        }
        @media (max-width: 1024px) {
          .react-calendar__month-view__days__day abbr {
            min-width: 20px;
            min-height: 20px;
          }
        }
        .mini-today abbr {
          box-shadow: inset 0 0 0 2px rgba(17, 24, 39, 0.35);
        }
        .mini-selected abbr {
          background: rgba(59, 130, 246, 0.12);
        }
        .mini-weekend {
          background: rgba(107, 114, 128, 0.06);
          border-radius: 10px;
        }
        .mini-outside {
          background: rgba(0, 0, 0, 0.04);
          border-radius: 10px;
        }
        .mini-outside-weekend {
          background: rgba(0, 0, 0, 0.06);
          border-radius: 10px;
        }
        .mini-marker {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          opacity: 0.35;
          z-index: 1;
        }
        @media (max-width: 1024px) {
          .mini-marker {
            width: 14px;
            height: 14px;
          }
        }
        .rbc-toolbar button:focus,
        .rbc-toolbar button:focus-visible,
        .react-calendar__navigation button:focus,
        .react-calendar__navigation button:focus-visible,
        .rbc-event:focus,
        .rbc-event:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }
        .rbc-toolbar button:focus-visible,
        .react-calendar__navigation button:focus-visible {
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.18) !important;
        }

        /* BIG calendar skin */
        .rbc-toolbar {
          margin-bottom: 8px;
          flex-wrap: wrap;
          gap: 8px;
        }
        @media (max-width: 640px) {
          .rbc-toolbar {
            font-size: 12px;
          }
          .rbc-toolbar button {
            padding: 4px 8px;
            font-size: 12px;
          }
        }
        .rbc-toolbar button {
          border-radius: 10px;
        }
        .rbc-month-view,
        .rbc-time-view,
        .rbc-agenda-view {
          border-radius: 14px;
          overflow: hidden;
        }
        .rbc-month-view .rbc-event,
        .rbc-month-view .rbc-event-content {
          white-space: normal !important;
          overflow-wrap: anywhere !important;
          line-height: 1.15;
        }
        .rbc-month-view .rbc-event {
          display: flex;
          align-items: center;
        }
        .rbc-month-view .rbc-event .rbc-event-inner {
          width: 100%;
        }

        /* Responzivní velikosti události */
        @media (max-width: 640px) {
          .rbc-event {
            font-size: 10px !important;
            padding: 2px 4px !important;
            min-height: 20px !important;
          }
        }

        /* Oprava zobrazení textu v týdenním a denním view */
        .rbc-day-slot .rbc-event,
        .rbc-time-view .rbc-event {
          overflow: visible !important;
        }

        .rbc-day-slot .rbc-events-container {
          margin-right: 0;
        }

        .rbc-day-slot .rbc-event-content,
        .rbc-time-view .rbc-event-content {
          white-space: normal !important;
          word-wrap: break-word !important;
          overflow-wrap: anywhere !important;
          display: block !important;
          width: 100% !important;
        }

        .rbc-header {
          padding: 8px 0;
          font-weight: 600;
          background: transparent;
          text-align: center;
        }
        @media (max-width: 640px) {
          .rbc-header {
            padding: 4px 0;
            font-size: 12px;
          }
        }
        .rbc-month-view {
          font-size: 14px;
        }
        @media (max-width: 640px) {
          .rbc-month-view {
            font-size: 11px;
          }
        }
        .rbc-off-range-bg {
          background: rgba(0, 0, 0, 0.02);
        }
        .rbc-event {
          border: none;
          margin: 1px 0;
        }
        .rbc-event-content {
          white-space: normal;
        }
        .rbc-selected-cell,
        .rbc-slot-selection {
          background-color: transparent !important;
        }
        .rbc-month-row + .rbc-month-row {
          border-top: 1px dashed rgba(0, 0, 0, 0.06);
        }
        .rbc-month-view .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid rgba(0, 0, 0, 0.08) !important;
        }
        .rbc-time-header,
        .rbc-time-content,
        .rbc-timeslot-group,
        .rbc-time-slot,
        .rbc-day-bg + .rbc-day-bg {
          border-color: rgba(0, 0, 0, 0.08) !important;
        }
        .rbc-time-content > * + * {
          border-left: 1px solid rgba(0, 0, 0, 0.08) !important;
        }
        .rbc-time-content > .rbc-time-gutter {
          border-right: 1px solid rgba(0, 0, 0, 0.08) !important;
        }
        .rbc-time-slot {
          border-top: 1px solid rgba(0, 0, 0, 0.06) !important;
        }
        .rbc-event-inner {
          display: block;
          font-weight: 700;
          line-height: 1.25;
        }
        .rbc-today {
          background: rgba(59, 130, 246, 0.06) !important;
        }

        /* Dark mode styles */
        html.dark .rbc-toolbar {
          color: rgba(255, 255, 255, 0.92);
        }
        html.dark .rbc-toolbar button {
          color: rgba(255, 255, 255, 0.9);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        html.dark .rbc-toolbar button:hover,
        html.dark .rbc-toolbar button:focus {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.1);
        }
        html.dark .rbc-toolbar .rbc-btn-group > button.rbc-active {
          background: rgba(255, 255, 255, 0.14);
          border-color: rgba(255, 255, 255, 0.16);
          color: #fff;
        }
        html.dark .rbc-month-view,
        html.dark .rbc-time-view,
        html.dark .rbc-agenda-view {
          background: #0f1115 !important;
          color: rgba(255, 255, 255, 0.92);
          border-color: rgba(255, 255, 255, 0.08) !important;
        }
        html.dark .rbc-header {
          color: rgba(255, 255, 255, 0.9) !important;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
        }
        html.dark .rbc-month-row + .rbc-month-row {
          border-top: 1px dashed rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .rbc-month-view .rbc-day-bg + .rbc-day-bg {
          border-left: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .rbc-time-header,
        html.dark .rbc-time-content,
        html.dark .rbc-timeslot-group,
        html.dark .rbc-time-slot,
        html.dark .rbc-day-bg + .rbc-day-bg {
          border-color: rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .rbc-time-content > * + * {
          border-left: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .rbc-time-content > .rbc-time-gutter {
          border-right: 1px solid rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .rbc-time-slot {
          border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        html.dark .rbc-today {
          background: rgba(59, 130, 246, 0.1) !important;
        }
        html.dark .rbc-date-cell.rbc-now,
        html.dark .rbc-header.rbc-today {
          color: #fff !important;
        }
        html.dark .rbc-event {
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.45) !important;
          color: #fff !important;
          text-shadow: 0 1px 1px rgba(0, 0, 0, 0.35);
        }
        html.dark .rbc-off-range-bg {
          background: rgba(255, 255, 255, 0.04) !important;
        }
        html.dark .react-calendar__tile:enabled:hover {
          background: rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .react-calendar__navigation button {
          color: rgba(255, 255, 255, 0.9);
          background: transparent;
        }
        html.dark .react-calendar__navigation button:hover {
          background: rgba(255, 255, 255, 0.07) !important;
        }
        html.dark .mini-weekend {
          background: rgba(255, 255, 255, 0.05) !important;
        }
        html.dark .mini-outside {
          background: rgba(255, 255, 255, 0.04) !important;
        }
        html.dark .mini-outside-weekend {
          background: rgba(255, 255, 255, 0.06) !important;
        }
        html.dark .mini-today abbr {
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35) !important;
        }
        html.dark .mini-selected abbr {
          background: rgba(59, 130, 246, 0.18) !important;
        }
        html.dark .mini-marker {
          opacity: 0.55 !important;
        }
        .react-calendar__tile:focus {
          outline: none;
          background: rgba(59, 130, 246, 0.08) !important;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .react-calendar__tile--active,
        .react-calendar__tile--active:focus {
          background: rgba(59, 130, 246, 0.12) !important;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .react-calendar__year-view .react-calendar__tile:focus,
        .react-calendar__decade-view .react-calendar__tile:focus,
        .react-calendar__century-view .react-calendar__tile:focus {
          background: rgba(59, 130, 246, 0.08) !important;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .react-calendar__navigation button:focus {
          outline: none;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        html.dark .react-calendar__tile:focus {
          background: rgba(59, 130, 246, 0.14) !important;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
        }
        html.dark .react-calendar__tile--active,
        html.dark .react-calendar__tile--active:focus {
          background: rgba(59, 130, 246, 0.18) !important;
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
        }
        html.dark .react-calendar__navigation button:focus {
          box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.28);
        }
        html.dark .rbc-toolbar button:focus-visible,
        html.dark .react-calendar__navigation button:focus-visible {
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2) !important;
        }
        html.dark .rbc-calendar *,
        html.dark .react-calendar * {
          border-color: hsl(0 0% 14.9%) !important;
        }
      `}</style>
    </div>
  )
}

/** Jednoduchá legenda barev pro mini kalendář */
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block size-2 rounded-full"
        style={{ background: color }}
      />
      <span>{label}</span>
    </div>
  )
}
