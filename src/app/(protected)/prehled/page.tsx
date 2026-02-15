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
import MiniCalendar from "react-calendar"

import { type Position } from "@/types/position"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
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
type EntityKind = "onb" | "off" | "cluster" | "combo" | "group"

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
  groupKind?: "onb" | "off"
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

const TYPE_LABEL_SHORT: Record<EventType, string> = {
  plannedStart: "Nástup pl.",
  actualStart: "Nástup sk.",
  plannedEnd: "Odchod pl.",
  actualEnd: "Odchod sk.",
}

const TYPE_LABEL_ULTRA_SHORT: Record<EventType, string> = {
  plannedStart: "N",
  actualStart: "N",
  plannedEnd: "O",
  actualEnd: "O",
}

const WORK_START_HOUR = 8
const WORK_END_HOUR = 18
const SLOT_LEN_MIN = 30

const MOBILE_WIDTH = 640
const TABLET_WIDTH = 860
const LAPTOP_WIDTH = 1700
const GROUP_AFTER = 2

const START_GRADIENT = `linear-gradient(90deg, ${COLORS.plannedStart} 0%, ${COLORS.plannedStart} 30%, ${COLORS.actualStart} 70%, ${COLORS.actualStart} 100%)`
const END_GRADIENT = `linear-gradient(90deg, ${COLORS.plannedEnd} 0%, ${COLORS.plannedEnd} 30%, ${COLORS.actualEnd} 70%, ${COLORS.actualEnd} 100%)`

type ScreenTier = "mobile" | "tablet" | "laptop" | "desktop"

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
  n.setSeconds(0, 0)

  const h = n.getHours()
  const m = n.getMinutes()

  if (h < WORK_START_HOUR) {
    n.setHours(WORK_START_HOUR, 0, 0, 0)
    return n
  }

  if (h > WORK_END_HOUR || (h === WORK_END_HOUR && m > 0)) {
    n.setHours(WORK_END_HOUR - 1, SLOT_LEN_MIN, 0, 0)
    return n
  }

  const flooredMinutes = m < SLOT_LEN_MIN ? 0 : SLOT_LEN_MIN
  n.setMinutes(flooredMinutes, 0, 0)
  return n
}

const slotKey = (d: Date) =>
  `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

const typeOrderMonth: Record<EventType, number> = {
  plannedStart: 1,
  actualStart: 2,
  plannedEnd: 3,
  actualEnd: 4,
}

const isStartType = (t: EventType) =>
  t === "plannedStart" || t === "actualStart"
const isEndType = (t: EventType) => t === "plannedEnd" || t === "actualEnd"

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

function countTypes(items: CalendarEvent[] | undefined) {
  const counts: Record<EventType, number> = {
    plannedStart: 0,
    actualStart: 0,
    plannedEnd: 0,
    actualEnd: 0,
  }
  ;(items ?? []).forEach((e) => {
    counts[e.type]++
  })
  return counts
}

function buildGroupLabel(
  kind: "onb" | "off",
  counts: Record<EventType, number>,
  tier: ScreenTier,
  view: View
) {
  const mul = "×"

  if (kind === "onb") {
    const p = counts.plannedStart
    const a = counts.actualStart
    const total = p + a

    if (view === "day") {
      const parts: string[] = []
      if (p > 0) parts.push(`Plánované ${p}${mul}`)
      if (a > 0) parts.push(`Skutečné ${a}${mul}`)
      return `Nástupy: ${parts.join(", ")}`
    }

    if (tier === "mobile") {
      return `N ${total}${mul}`
    }

    if (tier === "tablet") {
      return `Nástupy ${total}${mul}`
    }

    if (tier === "laptop") {
      const parts: string[] = []
      if (p > 0) parts.push(`pl. ${p}${mul}`)
      if (a > 0) parts.push(`sk. ${a}${mul}`)
      return `Nástupy: ${parts.join(" + ")}`
    }

    const parts: string[] = []
    if (p > 0) parts.push(`Plánované ${p}${mul}`)
    if (a > 0) parts.push(`Skutečné ${a}${mul}`)
    return `Nástupy: ${parts.join(", ")}`
  }

  const p = counts.plannedEnd
  const a = counts.actualEnd
  const total = p + a

  if (view === "day") {
    const parts: string[] = []
    if (p > 0) parts.push(`Plánované ${p}${mul}`)
    if (a > 0) parts.push(`Skutečné ${a}${mul}`)
    return `Odchody: ${parts.join(", ")}`
  }

  if (tier === "mobile") {
    return `O ${total}${mul}`
  }

  if (tier === "tablet") {
    return `Odchody ${total}${mul}`
  }

  if (tier === "laptop") {
    const parts: string[] = []
    if (p > 0) parts.push(`pl. ${p}${mul}`)
    if (a > 0) parts.push(`sk. ${a}${mul}`)
    return `Odchody: ${parts.join(" + ")}`
  }

  const parts: string[] = []
  if (p > 0) parts.push(`Plánované ${p}${mul}`)
  if (a > 0) parts.push(`Skutečné ${a}${mul}`)
  return `Odchody: ${parts.join(", ")}`
}

function buildSlotClusterLabel(args: {
  kind: "onb" | "off"
  counts: Record<EventType, number>
  tier: ScreenTier
  view: View
}) {
  const { kind, counts, tier, view } = args
  const mul = "×"

  if (tier === "desktop" && (view === "week" || view === "day")) {
    if (kind === "onb") {
      const p = counts.plannedStart
      const a = counts.actualStart
      const total = p + a
      if (p > 0 && a > 0) return `Nástup plánovaný + skutečný ${total}${mul}`
      if (p > 0) return `Plánovaný nástup ${p}${mul}`
      if (a > 0) return `Skutečný nástup ${a}${mul}`
      return `Nástupy ${total}${mul}`
    } else {
      const p = counts.plannedEnd
      const a = counts.actualEnd
      const total = p + a
      if (p > 0 && a > 0) return `Odchod plánovaný + skutečný ${total}${mul}`
      if (p > 0) return `Plánovaný odchod ${p}${mul}`
      if (a > 0) return `Skutečný odchod ${a}${mul}`
      return `Odchody ${total}${mul}`
    }
  }

  return buildGroupLabel(kind, counts, tier, view)
}

function getGroupBg(kind: "onb" | "off", counts: Record<EventType, number>) {
  if (kind === "onb") {
    if (counts.plannedStart > 0 && counts.actualStart > 0) return START_GRADIENT
    if (counts.actualStart > 0) return COLORS.actualStart
    return COLORS.plannedStart
  }
  if (counts.plannedEnd > 0 && counts.actualEnd > 0) return END_GRADIENT
  if (counts.actualEnd > 0) return COLORS.actualEnd
  return COLORS.plannedEnd
}

function isGradient(bg: string) {
  return bg.includes("linear-gradient")
}

function buildEventBg(event: CalendarEvent) {
  if (event.entity === "onb" || event.entity === "off")
    return COLORS[event.type]

  const counts = countTypes(event.clusterItems)
  if (event.entity === "group") {
    return getGroupBg(
      event.groupKind ?? (isEndType(event.type) ? "off" : "onb"),
      counts
    )
  }

  const hasStart = counts.plannedStart + counts.actualStart > 0
  const hasEnd = counts.plannedEnd + counts.actualEnd > 0

  if (hasStart && !hasEnd) return getGroupBg("onb", counts)
  if (hasEnd && !hasStart) return getGroupBg("off", counts)

  return "#0f172a"
}

function shouldClusterLabelShowTime(args: {
  view: View
  anchor: Date
  items: CalendarEvent[] | null
}) {
  const { view, anchor, items } = args

  if (view === "month") return false

  const onlyEndUntimed =
    (items ?? []).length > 0 &&
    (items ?? []).every((e) => isEndType(e.type) && !e.hasCustomTime)
  if (onlyEndUntimed) return false

  const anchorHasTime = anchor.getHours() !== 0 || anchor.getMinutes() !== 0
  const anyCustomTime = (items ?? []).some((e) => !!e.hasCustomTime)
  return anchorHasTime || anyCustomTime
}

export default function DashboardPage(): JSX.Element {
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [bigView, setBigView] = useState<View>("month")
  const [miniActiveStart, setMiniActiveStart] = useState<Date>(
    startOfMonth(new Date())
  )

  const [isMobile, setIsMobile] = useState(false)
  const [isTablet, setIsTablet] = useState(false)

  const [windowWidth, setWindowWidth] = useState(0)
  const [isDesktopMonthWide, setIsDesktopMonthWide] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_WIDTH}px)`)
    const tabletQuery = window.matchMedia(`(max-width: ${TABLET_WIDTH}px)`)

    const updateQueries = () => {
      setIsMobile(mobileQuery.matches)
      setIsTablet(tabletQuery.matches && !mobileQuery.matches)
    }

    updateQueries()

    const handleMobile = () => updateQueries()
    const handleTablet = () => updateQueries()

    mobileQuery.addEventListener("change", handleMobile)
    tabletQuery.addEventListener("change", handleTablet)

    return () => {
      mobileQuery.removeEventListener("change", handleMobile)
      tabletQuery.removeEventListener("change", handleTablet)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const update = () => setWindowWidth(window.innerWidth)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

  const tier = useMemo<ScreenTier>(() => {
    if (isMobile) return "mobile"
    if (isTablet) return "tablet"
    if (windowWidth >= LAPTOP_WIDTH) return "desktop"
    return "laptop"
  }, [isMobile, isTablet, windowWidth])

  const [positions, setPositions] = useState<Position[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [, setLoading] = useState(true)

  const [miniSelected, setMiniSelected] = useState<Date | null>(null)

  const miniCalRef = useRef<HTMLDivElement>(null)
  const bigRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!bigRef.current) return

    const el = bigRef.current
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0
      setIsDesktopMonthWide(w >= 1700)
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")))
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [slotDate, setSlotDate] = useState<Date | null>(null)
  const [planOpen, setPlanOpen] = useState(false)

  const [openNewOnbPlanned, setOpenNewOnbPlanned] = useState(false)
  const [openNewOnbActual, setOpenNewOnbActual] = useState(false)
  const [openNewOffPlanned, setOpenNewOffPlanned] = useState(false)
  const [openNewOffActual, setOpenNewOffActual] = useState(false)

  const [openEdit, setOpenEdit] = useState(false)
  const [editType, setEditType] = useState<"onb" | "off">("onb")
  const [editContext, setEditContext] = useState<"planned" | "actual">(
    "planned"
  )
  const [editId, setEditId] = useState<number | null>(null)
  const [editInitial, setEditInitial] = useState<Partial<
    OnbRow & OffRow
  > | null>(null)

  const [openConfirmOnb, setOpenConfirmOnb] = useState(false)
  const [openConfirmOff, setOpenConfirmOff] = useState(false)
  const [confirmOnbRow, setConfirmOnbRow] = useState<OnbRow | null>(null)
  const [confirmOffRow, setConfirmOffRow] = useState<OffRow | null>(null)

  const [onbActualStart, setOnbActualStart] = useState("")
  const [onbUserEmail, setOnbUserEmail] = useState("")
  const [onbUserName, setOnbUserName] = useState("")
  const [onbEvidence, setOnbEvidence] = useState("")
  const [onbNotes, setOnbNotes] = useState("")

  const [offActualEnd, setOffActualEnd] = useState("")
  const [offUserEmail, setOffUserEmail] = useState("")
  const [offUserName, setOffUserName] = useState("")
  const [offEvidence, setOffEvidence] = useState("")
  const [offNotes, setOffNotes] = useState("")

  const [clusterOpen, setClusterOpen] = useState(false)
  const [clusterItems, setClusterItems] = useState<CalendarEvent[] | null>(null)
  const [clusterSlotLabel, setClusterSlotLabel] = useState("")

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

        const offEvents: CalendarEvent[] = (offJson.data ?? []).flatMap((e) => {
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
              hasCustomTime: false,
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
              hasCustomTime: false,
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

  const displayEvents = useMemo<CalendarEvent[]>(() => {
    if (bigView === "month") {
      const perDay = new Map<string, CalendarEvent[]>()
      for (const ev of events) {
        const dk = dayKey(ev.start)
        const list = perDay.get(dk)
        list ? list.push(ev) : perDay.set(dk, [ev])
      }

      const out: CalendarEvent[] = []

      const pushStartEndGroups = (ordered: CalendarEvent[], dk: string) => {
        const counts = countTypes(ordered)
        const startItems = ordered.filter((e) => isStartType(e.type))
        const endItems = ordered.filter((e) => isEndType(e.type))

        if (startItems.length) {
          const sample = startItems[0]!
          out.push({
            id: `group-onb-${dk}`,
            title: buildGroupLabel("onb", counts, tier, "month"),
            start: sample.start,
            end: sample.end,
            type: counts.actualStart > 0 ? "actualStart" : "plannedStart",
            entity: "group",
            groupKind: "onb",
            numericId: -1,
            clusterItems: startItems,
          })
        }

        if (endItems.length) {
          const sample = endItems[0]!
          out.push({
            id: `group-off-${dk}`,
            title: buildGroupLabel("off", counts, tier, "month"),
            start: sample.start,
            end: sample.end,
            type: counts.actualEnd > 0 ? "actualEnd" : "plannedEnd",
            entity: "group",
            groupKind: "off",
            numericId: -1,
            clusterItems: endItems,
          })
        }
      }

      const pushTypeGroupsDesktop = (ordered: CalendarEvent[], dk: string) => {
        const byType: Record<EventType, CalendarEvent[]> = {
          plannedStart: [],
          actualStart: [],
          plannedEnd: [],
          actualEnd: [],
        }
        ordered.forEach((e) => byType[e.type].push(e))

        const itemsOut: CalendarEvent[] = []

        ;(
          [
            "plannedStart",
            "actualStart",
            "plannedEnd",
            "actualEnd",
          ] as EventType[]
        ).forEach((t) => {
          const items = byType[t]
          if (items.length >= 2) {
            const sample = items[0]!
            itemsOut.push({
              id: `group-${t}-${dk}`,
              title: (() => {
                const mul = "×"
                switch (t) {
                  case "plannedStart":
                    return `Plánované nástupy ${items.length}${mul}`
                  case "actualStart":
                    return `Skutečné nástupy ${items.length}${mul}`
                  case "plannedEnd":
                    return `Plánované odchody ${items.length}${mul}`
                  case "actualEnd":
                    return `Skutečné odchody ${items.length}${mul}`
                }
              })(),
              start: sample.start,
              end: sample.end,
              type: t,
              entity: "group",
              groupKind: isStartType(t) ? "onb" : "off",
              numericId: -1,
              clusterItems: items,
            })
          } else if (items.length === 1) {
            itemsOut.push(items[0]!)
          }
        })

        if (itemsOut.length > GROUP_AFTER) {
          pushStartEndGroups(ordered, dk)
          return
        }

        out.push(...itemsOut)
      }

      perDay.forEach((dayEvents, dk) => {
        const ordered = [...dayEvents].sort(
          (a, b) =>
            typeOrderMonth[a.type] - typeOrderMonth[b.type] ||
            a.title.localeCompare(b.title, "cs")
        )

        if (tier === "desktop" && isDesktopMonthWide) {
          if (ordered.length <= GROUP_AFTER) {
            out.push(...ordered)
            return
          }
          pushTypeGroupsDesktop(ordered, dk)
          return
        }

        pushStartEndGroups(ordered, dk)
      })

      return out
    }

    if (bigView === "week" || bigView === "day") {
      const out: CalendarEvent[] = []
      const perDay = new Map<string, CalendarEvent[]>()

      for (const ev of events) {
        const dk = dayKey(ev.start)
        const list = perDay.get(dk)
        list ? list.push(ev) : perDay.set(dk, [ev])
      }

      perDay.forEach((dayEvents, dk) => {
        if (!dayEvents.length) return

        const slots = new Map<string, CalendarEvent[]>()
        const occupiedSlots = new Set<string>()
        const baseDay = startOfDay(dayEvents[0]!.start)

        const addToSlot = (event: CalendarEvent, start: Date) => {
          const slotStart = normalizeSlotStart(start)
          const key = slotKey(slotStart)

          if (!slots.has(key)) slots.set(key, [])
          slots.get(key)!.push({
            ...event,
            start: slotStart,
            end: addMinutes(slotStart, SLOT_LEN_MIN),
          })
          occupiedSlots.add(key)
        }

        const timed = dayEvents.filter(
          (e) => e.entity === "onb" && e.hasCustomTime
        )
        const untimed = dayEvents.filter(
          (e) => !(e.entity === "onb" && e.hasCustomTime)
        )

        timed.forEach((ev) => addToSlot(ev, ev.start))

        let curH = WORK_START_HOUR
        let curM = 0

        const nextFreeSlotStart = () => {
          while (true) {
            if (curH >= WORK_END_HOUR) {
              curH = WORK_START_HOUR
              curM = 0
            }

            const key = `${curH}:${String(curM).padStart(2, "0")}`
            if (!occupiedSlots.has(key)) {
              const slotStart = setMinutes(
                setHours(new Date(baseDay), curH),
                curM
              )
              curM += SLOT_LEN_MIN
              if (curM >= 60) {
                curH++
                curM = 0
              }
              return slotStart
            }

            curM += SLOT_LEN_MIN
            if (curM >= 60) {
              curH++
              curM = 0
            }
          }
        }

        const untimedOrdered = [...untimed].sort((a, b) =>
          a.title.localeCompare(b.title, "cs")
        )
        untimedOrdered.forEach((ev) => addToSlot(ev, nextFreeSlotStart()))

        slots.forEach((slotEvents, sk) => {
          if (tier === "desktop" && isDesktopMonthWide) {
            out.push(...slotEvents)
            return
          }

          if (slotEvents.length === 1) {
            out.push(slotEvents[0]!)
            return
          }

          const counts = countTypes(slotEvents)
          const hasStart = counts.plannedStart + counts.actualStart > 0
          const hasEnd = counts.plannedEnd + counts.actualEnd > 0

          let title = `Události (${slotEvents.length})`
          let type: EventType = slotEvents[0]!.type
          let groupKind: "onb" | "off" | undefined

          if (hasStart && !hasEnd) {
            title = buildSlotClusterLabel({
              kind: "onb",
              counts,
              tier,
              view: bigView,
            })
            type = counts.actualStart > 0 ? "actualStart" : "plannedStart"
            groupKind = "onb"
          } else if (hasEnd && !hasStart) {
            title = buildSlotClusterLabel({
              kind: "off",
              counts,
              tier,
              view: bigView,
            })
            type = counts.actualEnd > 0 ? "actualEnd" : "plannedEnd"
            groupKind = "off"
          }

          const sample = slotEvents[0]!
          out.push({
            id: `cluster-${dk}-${sk}`,
            title,
            start: sample.start,
            end: sample.end,
            type,
            entity: "cluster",
            numericId: -1,
            clusterItems: slotEvents,
            groupKind,
          })
        })
      })

      return out
    }

    return events
  }, [events, bigView, tier, isDesktopMonthWide])

  const messages = useMemo(
    () => ({
      date: "Datum",
      time: "Čas",
      event: "Událost",
      allDay: "Celý den",
      week: isMobile ? "T" : "Týden",
      work_week: "Pracovní",
      day: isMobile ? "D" : "Den",
      month: isMobile ? "M" : "Měsíc",
      previous: isMobile ? "←" : "Předchozí",
      next: isMobile ? "→" : "Další",
      yesterday: "Včera",
      tomorrow: "Zítra",
      today: "Dnes",
      agenda: "Agenda",
      showMore: (total: number) => `+${total}`,
      noEventsInRange: "Žádné události",
    }),
    [isMobile]
  )

  const formats = useMemo(
    () => ({
      monthHeaderFormat: (date: Date) =>
        isMobile
          ? dfFormat(date, "MMM yyyy", { locale: cs })
          : dfFormat(date, "LLLL yyyy", { locale: cs }),

      dayHeaderFormat: (date: Date) => {
        if (tier === "mobile") return dfFormat(date, "d", { locale: cs })
        if (tier === "tablet")
          return dfFormat(date, "EEEEEE d.", { locale: cs })
        if (tier === "laptop") return dfFormat(date, "EE d.", { locale: cs })
        return dfFormat(date, "EEEE d.", { locale: cs })
      },

      dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
        isMobile
          ? `${dfFormat(start, "d.M.", { locale: cs })} – ${dfFormat(end, "d.M.", { locale: cs })}`
          : `${dfFormat(start, "d. LLLL", { locale: cs })} – ${dfFormat(end, "d. LLLL yyyy", { locale: cs })}`,
      weekdayFormat: (date: Date) =>
        dfFormat(date, isMobile ? "EE" : "EEEE", { locale: cs }),
      dayFormat: (date: Date) =>
        dfFormat(date, isMobile ? "d" : "EEEE d.", { locale: cs }),
      eventTimeRangeFormat: () => "",
      agendaTimeRangeFormat: () => "",
      timeGutterFormat: (date: Date) =>
        dfFormat(date, isMobile ? "HH" : "HH:mm", { locale: cs }),
    }),
    [isMobile, tier]
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

  const getEventTooltip = useCallback((event: CalendarEvent) => {
    if (event.entity === "cluster" || event.entity === "group") {
      return (
        event.clusterItems
          ?.map((e) => `${TYPE_LABEL[e.type]}: ${e.title}`)
          .join(", ")
          .slice(0, 500) || ""
      )
    }
    const typeText = TYPE_LABEL[event.type]
    if (event.hasCustomTime) {
      const timeStr = dfFormat(event.start, "HH:mm", { locale: cs })
      return `${typeText} ${event.title} (${timeStr})`
    }
    return `${typeText} ${event.title}`
  }, [])

  const onSelectEvent = useCallback(
    async (ev: CalendarEvent) => {
      if (
        (ev.entity === "cluster" || ev.entity === "group") &&
        ev.clusterItems?.length
      ) {
        setClusterItems(ev.clusterItems)

        const showTime = shouldClusterLabelShowTime({
          view: bigView,
          anchor: ev.start,
          items: ev.clusterItems,
        })

        setClusterSlotLabel(
          dfFormat(ev.start, showTime ? "d. M. yyyy HH:mm" : "d. M. yyyy", {
            locale: cs,
          })
        )
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
      } else if (ev.entity === "off") {
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
    [bigView, fetchOnb, fetchOff]
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

      const offEvents: CalendarEvent[] = (offJson.data ?? []).flatMap((e) => {
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
            hasCustomTime: false,
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
            hasCustomTime: false,
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

  const EventCell = useCallback(
    ({ event }: { event: CalendarEvent }) => {
      const fontSize =
        tier === "mobile"
          ? "10px"
          : bigView === "month"
            ? "11px"
            : bigView === "week"
              ? "12px"
              : "13px"

      if (bigView === "day") {
        return (
          <div
            className="rbc-event-inner"
            style={{
              fontWeight: 800,
              fontSize,
              lineHeight: 1.15,
              padding:
                tier === "mobile"
                  ? "1px 3px"
                  : tier === "tablet"
                    ? "2px 4px"
                    : "3px 6px",
              whiteSpace: "normal",
            }}
            title={getEventTooltip(event)}
          >
            {event.title}
          </div>
        )
      }

      let displayText = event.title

      if (event.entity === "group" || event.entity === "cluster") {
        displayText = event.title
      } else if (
        tier === "desktop" &&
        (bigView === "week" || bigView === "month")
      ) {
        displayText = event.title
      } else {
        if (tier === "mobile" && bigView === "week") {
          displayText = TYPE_LABEL_ULTRA_SHORT[event.type]
        } else if (tier === "mobile" || tier === "tablet") {
          displayText = TYPE_LABEL_SHORT[event.type]
        } else if (tier === "laptop" && bigView === "week") {
          displayText = TYPE_LABEL_SHORT[event.type]
        } else {
          displayText = TYPE_LABEL[event.type]
        }
      }

      return (
        <div
          className="rbc-event-inner"
          style={{
            fontWeight: 800,
            fontSize,
            lineHeight: 1.15,
            padding:
              tier === "mobile"
                ? "1px 3px"
                : tier === "tablet"
                  ? "2px 4px"
                  : "3px 6px",
            whiteSpace: "normal",
          }}
          title={getEventTooltip(event)}
        >
          {displayText}
        </div>
      )
    },
    [bigView, getEventTooltip, tier]
  )

  const calendarHeight = useMemo(() => {
    if (tier === "mobile") {
      return bigView === "month" ? "h-[480px]" : "h-[560px]"
    }
    if (tier === "tablet") {
      return bigView === "month" ? "h-[560px]" : "h-[640px]"
    }
    return "h-[calc(100vh-6rem)]"
  }, [bigView, tier])

  return (
    <div className="flex flex-col gap-4 p-2 sm:p-3 md:p-4 xl:flex-row xl:items-start xl:gap-6 xl:p-6">
      <aside className="w-full shrink-0 rounded-2xl bg-white/90 p-3 shadow-md ring-1 ring-black/5 dark:bg-neutral-900 xl:w-[280px] xl:p-4">
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

        <div className="mt-4 space-y-2 text-xs lg:text-sm">
          <div className="mb-1 font-semibold">Legenda</div>
          <Legend color={COLORS.plannedStart} label="Plánovaný nástup" />
          <Legend color={COLORS.actualStart} label="Skutečný nástup" />
          <Legend color={COLORS.plannedEnd} label="Plánovaný odchod" />
          <Legend color={COLORS.actualEnd} label="Skutečný odchod" />
        </div>
      </aside>

      <section
        ref={bigRef}
        className="min-w-0 max-w-full flex-1 rounded-2xl bg-white p-2 shadow-lg ring-1 ring-black/5 dark:bg-neutral-900 sm:p-3 lg:p-4"
      >
        <div className={`w-full ${calendarHeight}`}>
          <Calendar<CalendarEvent>
            localizer={localizer}
            events={displayEvents}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            selectable="ignoreEvents"
            longPressThreshold={10}
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
            scrollToTime={minTime}
            components={{ event: EventCell }}
            tooltipAccessor={null}
            dayLayoutAlgorithm="no-overlap"
            eventPropGetter={(event) => {
              const bg = buildEventBg(event)
              const gradient = isGradient(bg)

              return {
                style: {
                  backgroundColor: gradient ? undefined : bg,
                  backgroundImage: gradient ? bg : undefined,
                  color: "white",
                  borderRadius: tier === "mobile" ? 6 : 10,
                  border: "none",
                  padding:
                    tier === "mobile"
                      ? "1px 3px"
                      : tier === "tablet"
                        ? "2px 4px"
                        : bigView === "month"
                          ? "4px 6px"
                          : "6px 8px",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.12)",
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  lineHeight: 1.15,
                  fontSize:
                    tier === "mobile" ? 10 : bigView === "month" ? 11 : 12,
                  fontWeight: 800,
                  textShadow: "0 1px 1px rgba(0,0,0,0.22)",
                  overflow: "hidden",
                  height: "auto",
                  minHeight:
                    tier === "mobile"
                      ? "16px"
                      : tier === "tablet"
                        ? "20px"
                        : bigView === "month"
                          ? "24px"
                          : "28px",
                },
              }
            }}
            style={{ height: "100%" }}
          />
        </div>
      </section>
      <style jsx global>{`
        .rbc-month-view,
        .rbc-time-view,
        .rbc-calendar {
          touch-action: manipulation;
        }
        .rbc-day-bg,
        .rbc-date-cell {
          touch-action: manipulation;
          cursor: pointer;
        }
        .rbc-time-slot,
        .rbc-day-slot {
          touch-action: pan-y;
          cursor: pointer;
        }
        .touch-scroll {
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .rbc-calendar {
          min-width: 100%;
          width: 100%;
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
        }
        .rbc-toolbar {
          flex-shrink: 0;
        }
        .rbc-event {
          white-space: normal !important;
          word-break: break-word !important;
          overflow-wrap: anywhere !important;
          overflow: hidden !important;
          box-sizing: border-box !important;
        }
        .rbc-event-label {
          display: none !important;
        }
        .rbc-show-more {
          font-size: 11px;
          padding: 1px 3px;
          margin-top: 1px;
          cursor: pointer;
          background: transparent;
        }
        .rbc-month-view {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow: hidden !important;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .rbc-month-header {
          flex-shrink: 0 !important;
          border-bottom: 1px solid #e5e7eb;
        }
        .rbc-month-row {
          flex: 1 1 0% !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: hidden !important;
          position: relative !important;
          border-bottom: 1px solid #e5e7eb;
        }
        .rbc-month-row:last-child {
          border-bottom: none !important;
        }
        .rbc-row-bg {
          display: flex !important;
          position: absolute !important;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
        }
        .rbc-row-content {
          position: relative !important;
          z-index: 1 !important;
          padding-bottom: 2px;
        }
        .rbc-row-segment {
          padding: 1px 2px !important;
        }
        .rbc-month-view .rbc-event {
          height: auto !important;
          min-height: 20px !important;
          padding: 2px 5px !important;
          margin-bottom: 1px !important;
          font-size: 11px !important;
          line-height: 1.3 !important;
          border-radius: 4px !important;
        }
        .rbc-date-cell {
          padding: 2px 4px !important;
          font-size: 12px;
          text-align: right;
        }
        .rbc-time-view {
          display: flex !important;
          flex-direction: column !important;
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow: clip !important;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .rbc-time-header {
          flex-shrink: 0 !important;
          overflow: visible !important;
          border-bottom: 1px solid #e5e7eb;
        }
        .rbc-time-content {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          overflow-x: hidden !important;
          overflow-y: scroll !important;
        }
        .rbc-timeslot-group {
          min-height: 92px !important;
          border-bottom: 1px solid #f3f4f6;
        }
        .rbc-time-slot {
          min-height: 46px !important;
        }
        .rbc-time-gutter {
          width: 56px !important;
          font-size: 11px !important;
          flex-shrink: 0 !important;
        }
        .rbc-time-view .rbc-event {
          font-size: 12px !important;
          padding: 2px 5px !important;
          border-radius: 4px !important;
          overflow: hidden !important;
        }
        .rbc-time-view .rbc-event-content {
          white-space: normal !important;
          overflow: hidden !important;
          word-break: break-word !important;
        }
        .react-calendar__tile {
          position: relative !important;
          overflow: visible !important;
          display: block !important;
          padding: 5px 2px !important;
          text-align: center !important;
        }
        .react-calendar__tile abbr {
          display: inline-block !important;
          font-size: 13px !important;
          width: 26px !important;
          height: 26px !important;
          line-height: 26px !important;
          text-align: center !important;
          border-radius: 50% !important;
          position: relative !important;
          z-index: 2 !important;
        }
        .mini-marker {
          position: absolute !important;
          top: 50% !important;
          left: 50% !important;
          transform: translate(-50%, -50%) !important;
          width: 26px !important;
          height: 26px !important;
          border-radius: 50% !important;
          pointer-events: none !important;
          z-index: 1 !important;
          display: block !important;
          opacity: 0.4 !important;
        }

        .react-calendar__month-view__days__day--weekend abbr {
          color: #dc2626 !important;
        }
        .react-calendar__month-view__days__day--weekend.mini-outside abbr,
        .react-calendar__month-view__days__day--weekend.mini-outside-weekend
          abbr {
          color: #fca5a5 !important;
        }

        .mini-today abbr {
          font-weight: 700 !important;
        }
        .mini-selected {
          background: rgba(59, 130, 246, 0.15) !important;
          border: 2px solid rgb(59, 130, 246) !important;
          border-radius: 4px !important;
        }
        .mini-weekend {
          background: rgba(220, 38, 38, 0.03);
        }
        .mini-outside {
          opacity: 0.4;
        }
        .mini-outside-weekend {
          opacity: 0.35;
        }
        .react-calendar {
          width: 100%;
          border: none;
          font-family: inherit;
        }
        .react-calendar__navigation button {
          font-size: 14px;
          font-weight: 600;
          min-width: 36px;
          height: 36px;
        }
        .react-calendar__month-view__weekdays {
          font-size: 11px;
          font-weight: 600;
          text-transform: lowercase;
        }
        .react-calendar__month-view__days__day {
          color: inherit;
        }

        @media (max-width: 640px) {
          .rbc-calendar {
            font-size: 11px;
          }
          .rbc-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 0.25rem;
            padding: 0.25rem;
          }
          .rbc-toolbar .rbc-btn-group {
            flex-wrap: nowrap;
            justify-content: center;
            width: 100%;
          }
          .rbc-toolbar button {
            font-size: 10px;
            padding: 0.25rem 0.5rem;
          }
          .rbc-toolbar .rbc-toolbar-label {
            font-size: 12px;
            font-weight: 600;
            text-align: center;
            width: 100%;
            padding: 0.25rem 0;
          }
          .rbc-header {
            padding: 3px !important;
            font-size: 10px !important;
            font-weight: 700;
          }
          .rbc-date-cell {
            padding: 1px 2px !important;
            font-size: 10px !important;
          }
          .rbc-month-view .rbc-event {
            font-size: 9px !important;
            padding: 1px 2px !important;
            min-height: 14px !important;
          }
          .rbc-time-gutter {
            width: 34px !important;
            font-size: 9px !important;
          }
          .rbc-timeslot-group {
            min-height: 56px !important;
          }
          .rbc-time-slot {
            min-height: 28px !important;
          }
          .rbc-time-view .rbc-event {
            font-size: 10px !important;
            padding: 1px 3px !important;
          }
        }

        @media (min-width: 641px) and (max-width: 860px) {
          .rbc-toolbar button {
            font-size: 11px;
            padding: 0.35rem 0.75rem;
          }
          .rbc-header {
            padding: 3px !important;
            font-size: 10px !important;
          }
          .rbc-month-view .rbc-event {
            font-size: 10px !important;
          }
          .rbc-timeslot-group {
            min-height: 80px !important;
          }
        }
      `}</style>

      {planOpen && (
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/40 p-4"
          onClick={() => setPlanOpen(false)}
        >
          <div
            className={`w-full ${tier === "mobile" ? "max-w-[340px]" : "max-w-[460px]"} rounded-2xl bg-white p-4 text-neutral-800 shadow-xl ring-1 ring-black/5 dark:bg-neutral-900 dark:text-neutral-100`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className={`mb-2 ${tier === "mobile" ? "text-base" : "text-lg"} font-semibold`}
            >
              Naplánovat akci
            </h3>
            <p
              className={`mb-4 ${tier === "mobile" ? "text-xs" : "text-sm"} text-neutral-600 dark:text-neutral-300`}
            >
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
                className={`rounded-lg ${tier === "mobile" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} text-white`}
                style={{ background: COLORS.plannedStart }}
                onClick={() => openCreate("onb-planned")}
              >
                {tier === "mobile" ? "Pl. nástup" : "Předpokládaný nástup"}
              </button>
              <button
                className={`rounded-lg ${tier === "mobile" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} text-white`}
                style={{ background: COLORS.actualStart }}
                onClick={() => openCreate("onb-actual")}
              >
                {tier === "mobile" ? "Sk. nástup" : "Skutečný nástup"}
              </button>
              <button
                className={`rounded-lg ${tier === "mobile" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} text-white`}
                style={{ background: COLORS.plannedEnd }}
                onClick={() => openCreate("off-planned")}
              >
                {tier === "mobile" ? "Pl. odchod" : "Plánovaný odchod"}
              </button>
              <button
                className={`rounded-lg ${tier === "mobile" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm"} text-white`}
                style={{ background: COLORS.actualEnd }}
                onClick={() => openCreate("off-actual")}
              >
                {tier === "mobile" ? "Sk. odchod" : "Skutečný odchod"}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className={`rounded-md ${tier === "mobile" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"} text-gray-600 hover:bg-gray-100 dark:text-neutral-300 dark:hover:bg-white/10`}
                onClick={() => setPlanOpen(false)}
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={openNewOnbPlanned} onOpenChange={setOpenNewOnbPlanned}>
        <DialogContent
          className={`z-[300] max-h-[90vh] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-5xl"} touch-scroll overflow-y-auto p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Nový předpokládaný nástup
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Formulář pro vytvoření předpokládaného nástupu.
            </span>
          </DialogDescription>
          <div className={tier === "mobile" ? "p-4" : "p-6"}>
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOnbActual} onOpenChange={setOpenNewOnbActual}>
        <DialogContent
          className={`z-[300] max-h-[90vh] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-5xl"} touch-scroll overflow-y-auto p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Nový skutečný nástup
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Formulář pro vytvoření skutečného nástupu.
            </span>
          </DialogDescription>
          <div className={tier === "mobile" ? "p-4" : "p-6"}>
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOffPlanned} onOpenChange={setOpenNewOffPlanned}>
        <DialogContent
          className={`z-[300] max-h-[90vh] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-5xl"} touch-scroll overflow-y-auto p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Nový plánovaný odchod
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Formulář pro vytvoření plánovaného odchodu.
            </span>
          </DialogDescription>
          <div className={tier === "mobile" ? "p-4" : "p-6"}>
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openNewOffActual} onOpenChange={setOpenNewOffActual}>
        <DialogContent
          className={`z-[300] max-h-[90vh] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-5xl"} touch-scroll overflow-y-auto p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Nový skutečný odchod
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Formulář pro vytvoření skutečného odchodu.
            </span>
          </DialogDescription>
          <div className={tier === "mobile" ? "p-4" : "p-6"}>
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clusterOpen} onOpenChange={setClusterOpen}>
        <DialogContent
          className={`z-[300] ${tier === "mobile" ? "max-w-[90vw]" : "max-w-md"} touch-scroll`}
        >
          <DialogTitle className={tier === "mobile" ? "text-sm" : ""}>
            Události {clusterSlotLabel}
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Seznam událostí v daném dni nebo časovém slotu.
            </span>
          </DialogDescription>

          <div className="mt-2 space-y-2">
            {clusterItems?.map((e) => (
              <button
                key={e.id}
                className={`w-full rounded-md border ${tier === "mobile" ? "px-2 py-1.5" : "px-3 py-2"} text-left hover:bg-muted`}
                onClick={() => {
                  setClusterOpen(false)
                  void onSelectEvent({ ...e, entity: e.entity })
                }}
                title={`${TYPE_LABEL[e.type]}: ${e.title}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 inline-block size-2 rounded-full"
                    style={{ background: COLORS[e.type] }}
                  />
                  <div className="min-w-0">
                    <div
                      className={`truncate font-semibold ${tier === "mobile" ? "text-xs" : "text-sm"}`}
                    >
                      {e.title}
                    </div>
                    <div
                      className={`opacity-80 ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                    >
                      {TYPE_LABEL[e.type]}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent
          className={`z-[300] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-3xl"} overflow-hidden p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Potvrdit skutečný nástup
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">Potvrzení nástupu a doplnění údajů.</span>
          </DialogDescription>

          <div
            className={`max-h-[80vh] space-y-4 overflow-y-auto ${tier === "mobile" ? "p-4" : "p-6"} touch-scroll`}
          >
            {confirmOnbRow && (
              <>
                <div
                  className={`rounded-lg border bg-muted/30 ${tier === "mobile" ? "p-2 text-xs" : "p-3 text-sm"}`}
                >
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
                      size={tier === "mobile" ? "sm" : "default"}
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
                      Nesouhlasí – upravit
                    </Button>
                  </div>
                </div>

                <div
                  className={`rounded-lg border bg-blue-50 dark:bg-blue-900/20 ${tier === "mobile" ? "p-2 text-xs" : "p-3 text-sm"}`}
                >
                  <label className="mb-1 block font-medium">
                    Datum skutečného nástupu
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="date"
                      value={onbActualStart}
                      onChange={(e) => setOnbActualStart(e.target.value)}
                      className={
                        tier === "mobile"
                          ? "max-w-full text-xs"
                          : "max-w-[220px]"
                      }
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Firemní e-mail (nepovinné)
                      </label>
                      <Input
                        type="email"
                        value={onbUserEmail}
                        onChange={(e) => setOnbUserEmail(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Uživatelské jméno (nepovinné)
                      </label>
                      <Input
                        value={onbUserName}
                        onChange={(e) => setOnbUserName(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Osobní číslo (nepovinné)
                      </label>
                      <Input
                        value={onbEvidence}
                        onChange={(e) => setOnbEvidence(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Poznámka (nepovinné)
                      </label>
                      <Textarea
                        value={onbNotes}
                        onChange={(e) => setOnbNotes(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      size={tier === "mobile" ? "sm" : "default"}
                      onClick={() => void confirmOnboarding()}
                      disabled={!onbActualStart}
                    >
                      Potvrdit nástup
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent
          className={`z-[300] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-3xl"} overflow-hidden p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Potvrdit skutečný odchod
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">Potvrzení odchodu a doplnění údajů.</span>
          </DialogDescription>

          <div
            className={`max-h-[80vh] space-y-4 overflow-y-auto ${tier === "mobile" ? "p-4" : "p-6"} touch-scroll`}
          >
            {confirmOffRow && (
              <>
                <div
                  className={`rounded-lg border bg-muted/30 ${tier === "mobile" ? "p-2 text-xs" : "p-3 text-sm"}`}
                >
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
                      size={tier === "mobile" ? "sm" : "default"}
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
                      Nesouhlasí – upravit
                    </Button>
                  </div>
                </div>

                <div
                  className={`rounded-lg border bg-amber-50 dark:bg-amber-950/30 ${tier === "mobile" ? "p-2 text-xs" : "p-3 text-sm"}`}
                >
                  <label className="mb-1 block font-medium">
                    Datum skutečného odchodu
                  </label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="date"
                      value={offActualEnd}
                      onChange={(e) => setOffActualEnd(e.target.value)}
                      className={
                        tier === "mobile"
                          ? "max-w-full text-xs"
                          : "max-w-[220px]"
                      }
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Firemní e-mail (nepovinné)
                      </label>
                      <Input
                        type="email"
                        value={offUserEmail}
                        onChange={(e) => setOffUserEmail(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Uživatelské jméno (nepovinné)
                      </label>
                      <Input
                        value={offUserName}
                        onChange={(e) => setOffUserName(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div>
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Osobní číslo (nepovinné)
                      </label>
                      <Input
                        value={offEvidence}
                        onChange={(e) => setOffEvidence(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label
                        className={`mb-1 block font-medium ${tier === "mobile" ? "text-[10px]" : "text-xs"}`}
                      >
                        Poznámka (nepovinné)
                      </label>
                      <Textarea
                        value={offNotes}
                        onChange={(e) => setOffNotes(e.target.value)}
                        className={tier === "mobile" ? "text-xs" : ""}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      size={tier === "mobile" ? "sm" : "default"}
                      onClick={() => void confirmOffboarding()}
                      disabled={!offActualEnd}
                    >
                      Potvrdit odchod
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
        <DialogContent
          className={`z-[300] max-h-[90dvh] ${tier === "mobile" ? "max-w-[95vw]" : "max-w-5xl"} overflow-hidden p-0`}
        >
          <DialogTitle
            className={`${tier === "mobile" ? "px-4 pt-4 text-base" : "px-6 pt-6"}`}
          >
            Upravit záznam
          </DialogTitle>
          <DialogDescription asChild>
            <span className="sr-only">
              Formulář pro úpravu vybraného záznamu.
            </span>
          </DialogDescription>

          <div
            className={`max-h-[calc(90dvh-4.5rem)] overflow-y-auto ${tier === "mobile" ? "p-4" : "p-6"} touch-scroll`}
            data-lenis-prevent
          >
            {editId != null && editInitial && (
              <>
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
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

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
