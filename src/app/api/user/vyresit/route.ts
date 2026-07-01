import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { z } from "zod"

import { prisma } from "@/lib/db"
import { canReadInternalApp } from "@/lib/rbac"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

const bodySchema = z.object({
  ids: z.array(z.string().trim().min(1)).max(100),
})

type ResolveUsersResult = {
  map: Record<string, string>
  requested: number
  found: number
  missing: number
  missingIds?: string[]
}

function normalizeIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
}

function buildDisplayName(user: {
  id: string
  name: string | null
  surname: string | null
  email: string | null
  role: string
}) {
  const displayName =
    [user.name, user.surname].filter(Boolean).join(" ").trim() ||
    user.email ||
    user.id

  return user.role && user.role !== "USER"
    ? `${displayName} (${user.role})`
    : displayName
}

async function requireInternalReadAccess() {
  const session = await auth()

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { status: "error", message: "Nejste přihlášen(a)." },
        { status: 401 }
      ),
    }
  }

  if (!canReadInternalApp(session.user.role)) {
    return {
      error: NextResponse.json(
        {
          status: "error",
          message: "Nemáte oprávnění načítat uživatele.",
        },
        { status: 403 }
      ),
    }
  }

  return { session }
}

async function resolveUsers(ids: string[]): Promise<ResolveUsersResult> {
  const uniqueIds = normalizeIds(ids)

  if (uniqueIds.length === 0) {
    return {
      map: {},
      requested: 0,
      found: 0,
      missing: 0,
    }
  }

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
  const foundRequestedIds = new Set<string>()

  for (const user of users) {
    const label = buildDisplayName(user)

    if (uniqueIds.includes(user.id)) {
      map[user.id] = label
      foundRequestedIds.add(user.id)
    }

    if (user.email && uniqueIds.includes(user.email)) {
      map[user.email] = label
      foundRequestedIds.add(user.email)
    }
  }

  const missingIds: string[] = []

  for (const id of uniqueIds) {
    if (!foundRequestedIds.has(id)) {
      map[id] = `Neznámý uživatel (${id})`
      missingIds.push(id)
    }
  }

  return {
    map,
    requested: uniqueIds.length,
    found: foundRequestedIds.size,
    missing: missingIds.length,
    missingIds: missingIds.length > 0 ? missingIds : undefined,
  }
}

export async function POST(req: NextRequest) {
  const access = await requireInternalReadAccess()

  if ("error" in access) {
    return access.error
  }

  try {
    const rawBody = await req.json().catch(() => ({}))
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

    const result = await resolveUsers(parseResult.data.ids)

    return NextResponse.json({
      status: "success",
      data: result.map,
      meta: {
        requested: result.requested,
        found: result.found,
        missing: result.missing,
        missingIds: result.missingIds,
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

export async function GET(req: NextRequest) {
  const access = await requireInternalReadAccess()

  if ("error" in access) {
    return access.error
  }

  try {
    const idsParam = req.nextUrl.searchParams.get("ids")

    if (!idsParam) {
      return NextResponse.json(
        {
          status: "error",
          message: "Parametr 'ids' je povinný. Použijte: ?ids=id1,id2,id3",
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
        meta: {
          requested: 0,
          found: 0,
          missing: 0,
        },
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

    const result = await resolveUsers(parseResult.data.ids)

    return NextResponse.json({
      status: "success",
      data: result.map,
      meta: {
        requested: result.requested,
        found: result.found,
        missing: result.missing,
        missingIds: result.missingIds,
      },
    })
  } catch (error) {
    console.error("GET /api/user/vyresit error:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Chyba při zpracování dotazu.",
      },
      { status: 500 }
    )
  }
}
