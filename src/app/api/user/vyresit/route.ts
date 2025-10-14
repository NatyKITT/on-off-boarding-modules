import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

// Validace vstupu
const bodySchema = z.object({
  ids: z.array(z.string().min(1)).max(100), // max 100 IDs najednou
})

export async function POST(req: NextRequest) {
  try {
    // Bezpečné parsování JSON
    const rawBody = await req.json().catch(() => ({}))

    // Validace vstupu
    const parseResult = bodySchema.safeParse(rawBody)
    if (!parseResult.success) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Neplatný formát dat. Očekáváno pole 'ids' s maximálně 100 položkami.",
          errors: parseResult.error.issues,
        },
        { status: 400 }
      )
    }

    const { ids } = parseResult.data

    // Odstranění duplicit a prázdných hodnot
    const uniqueIds = [...new Set(ids.filter(Boolean))]

    if (uniqueIds.length === 0) {
      return NextResponse.json({
        status: "success",
        data: {},
        meta: { requested: 0, found: 0, missing: 0 },
      })
    }

    // Hledání uživatelů
    const users = await prisma.user.findMany({
      where: {
        OR: [{ id: { in: uniqueIds } }, { email: { in: uniqueIds } }],
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true, // přidat roli pro lepší kontext
      },
    })

    // Vytvoření mapování
    const map: Record<string, string> = {}
    const foundIds = new Set<string>()

    for (const user of users) {
      const displayName =
        [user.name, user.surname].filter(Boolean).join(" ").trim() ||
        user.email ||
        user.id

      // Přidat roli do display name (volitelně)
      const withRole =
        user.role && user.role !== "USER"
          ? `${displayName} (${user.role})`
          : displayName

      // Mapování podle ID
      if (user.id) {
        map[user.id] = withRole
        foundIds.add(user.id)
      }

      // Mapování podle emailu (pokud byl email v požadavku)
      if (user.email && uniqueIds.includes(user.email)) {
        map[user.email] = withRole
        foundIds.add(user.email)
      }
    }

    // Pro neexistující ID/emaily vrátit původní hodnotu nebo placeholder
    const missingIds: string[] = []
    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        map[id] = `Neznámý uživatel (${id})` // nebo prostě: map[id] = id
        missingIds.push(id)
      }
    }

    return NextResponse.json({
      status: "success",
      data: map,
      meta: {
        requested: uniqueIds.length,
        found: users.length,
        missing: missingIds.length,
        missingIds: missingIds.length > 0 ? missingIds : undefined,
      },
    })
  } catch (error) {
    console.error("POST /api/user/vyresit error:", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se převést identifikátory uživatelů.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// GET verze pro jednoduché dotazy přes URL params
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const idsParam = searchParams.get("ids")

    if (!idsParam) {
      return NextResponse.json(
        {
          status: "error",
          message: "Parameter 'ids' je povinný. Použijte: ?ids=id1,id2,id3",
        },
        { status: 400 }
      )
    }

    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)

    if (ids.length === 0) {
      return NextResponse.json({
        status: "success",
        data: {},
      })
    }

    if (ids.length > 50) {
      return NextResponse.json(
        {
          status: "error",
          message: "Maximálně 50 IDs v GET požadavku. Pro více použijte POST.",
        },
        { status: 400 }
      )
    }

    // Validace pomocí schéma
    const parseResult = bodySchema.safeParse({ ids })
    if (!parseResult.success) {
      return NextResponse.json(
        {
          status: "error",
          message: "Neplatný formát IDs.",
          errors: parseResult.error.issues,
        },
        { status: 400 }
      )
    }

    // Duplikace logiky z POST (bez any typu)
    const uniqueIds = [...new Set(ids.filter(Boolean))]

    const users = await prisma.user.findMany({
      where: {
        OR: [{ id: { in: uniqueIds } }, { email: { in: uniqueIds } }],
      },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
      },
    })

    const map: Record<string, string> = {}
    const foundIds = new Set<string>()

    for (const user of users) {
      const displayName =
        [user.name, user.surname].filter(Boolean).join(" ").trim() ||
        user.email ||
        user.id

      const withRole =
        user.role && user.role !== "USER"
          ? `${displayName} (${user.role})`
          : displayName

      if (user.id) {
        map[user.id] = withRole
        foundIds.add(user.id)
      }

      if (user.email && uniqueIds.includes(user.email)) {
        map[user.email] = withRole
        foundIds.add(user.email)
      }
    }

    const missingIds: string[] = []
    for (const id of uniqueIds) {
      if (!foundIds.has(id)) {
        map[id] = `Neznámý uživatel (${id})`
        missingIds.push(id)
      }
    }

    return NextResponse.json({
      status: "success",
      data: map,
      meta: {
        requested: uniqueIds.length,
        found: users.length,
        missing: missingIds.length,
        missingIds: missingIds.length > 0 ? missingIds : undefined,
      },
    })
  } catch (error) {
    console.error("GET /api/user/vyresit error:", error)
    return NextResponse.json(
      { status: "error", message: "Chyba při zpracování dotazu." },
      { status: 500 }
    )
  }
}
