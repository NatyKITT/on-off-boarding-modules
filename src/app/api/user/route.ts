import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { Prisma, Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { canManageUsers } from "@/lib/rbac"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

function parseEnvEmails(envValue: string | undefined): string[] {
  return (envValue ?? "")
    .split(/[;,]/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
}

function getProtectedEmails(): ReadonlySet<string> {
  return new Set([
    ...parseEnvEmails(process.env.SUPER_ADMIN_EMAILS),
    ...parseEnvEmails(process.env.HR_EMAILS),
    ...parseEnvEmails(process.env.IT_EMAILS),
    ...parseEnvEmails(process.env.READONLY_EMAILS),
  ])
}

function isValidRole(value: unknown): value is Role {
  return (
    typeof value === "string" && Object.values(Role).includes(value as Role)
  )
}

async function requireUserManagementAccess() {
  const session = await auth()

  if (!session?.user) {
    return {
      error: NextResponse.json(
        { status: "error", message: "Nejste přihlášen(a)." },
        { status: 401 }
      ),
    }
  }

  if (!canManageUsers(session.user.role)) {
    return {
      error: NextResponse.json(
        {
          status: "error",
          message: "Nemáte oprávnění spravovat uživatele.",
        },
        { status: 403 }
      ),
    }
  }

  return { session }
}

async function getUserRelationCounts(userId: string) {
  const [
    onboardings,
    mentoredOnboardings,
    offboardings,
    lockedExitChecklists,
    exitChecklistAssets,
    probationEvaluations,
  ] = await Promise.all([
    prisma.employeeOnboarding.count({
      where: { userId },
    }),
    prisma.employeeOnboarding.count({
      where: { mentorId: userId },
    }),
    prisma.employeeOffboarding.count({
      where: { userId },
    }),
    prisma.exitChecklist.count({
      where: { lockedById: userId },
    }),
    prisma.exitChecklistAsset.count({
      where: { createdById: userId },
    }),
    prisma.probationEvaluation.count({
      where: { evaluatedById: userId },
    }),
  ])

  const total =
    onboardings +
    mentoredOnboardings +
    offboardings +
    lockedExitChecklists +
    exitChecklistAssets +
    probationEvaluations

  return {
    total,
    onboardings,
    mentoredOnboardings,
    offboardings,
    lockedExitChecklists,
    exitChecklistAssets,
    probationEvaluations,
  }
}

export async function GET() {
  const access = await requireUserManagementAccess()

  if ("error" in access) {
    return access.error
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        canAccessApp: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({
      status: "success",
      data: users,
    })
  } catch (error) {
    console.error("Chyba při načítání uživatelů:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se načíst seznam uživatelů.",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const access = await requireUserManagementAccess()

  if ("error" in access) {
    return access.error
  }

  const currentUser = access.session.user

  try {
    const targetUserId = req.nextUrl.searchParams.get("userId")

    if (!targetUserId) {
      return NextResponse.json(
        {
          status: "error",
          message: "ID uživatele je povinné.",
        },
        { status: 400 }
      )
    }

    if (targetUserId === currentUser.id) {
      return NextResponse.json(
        {
          status: "error",
          message: "Nemůžete odebrat sama sebe.",
        },
        { status: 409 }
      )
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        surname: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        {
          status: "error",
          message: "Uživatel nenalezen.",
        },
        { status: 404 }
      )
    }

    const protectedEmails = getProtectedEmails()
    const targetEmail = targetUser.email.trim().toLowerCase()

    if (protectedEmails.has(targetEmail)) {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Tento uživatel je definovaný v ENV a nelze ho odebrat přes administraci.",
        },
        { status: 403 }
      )
    }

    const relationCounts = await getUserRelationCounts(targetUser.id)

    if (relationCounts.total > 0) {
      await prisma.$transaction([
        prisma.session.deleteMany({
          where: { userId: targetUser.id },
        }),
        prisma.user.update({
          where: { id: targetUser.id },
          data: {
            role: Role.USER,
            canAccessApp: false,
          },
        }),
      ])

      return NextResponse.json({
        status: "success",
        action: "revoked",
        message:
          "Uživatel má vazby v systému, proto nebyl fyzicky smazán. Byl mu odebrán přístup do aplikace.",
        relationCounts,
      })
    }

    await prisma.$transaction([
      prisma.session.deleteMany({
        where: { userId: targetUser.id },
      }),
      prisma.account.deleteMany({
        where: { userId: targetUser.id },
      }),
      prisma.user.delete({
        where: { id: targetUser.id },
      }),
    ])

    return NextResponse.json({
      status: "success",
      action: "deleted",
      message: "Uživatel byl odstraněn.",
    })
  } catch (error) {
    console.error("Chyba při mazání uživatele:", error)

    const code = (error as { code?: string } | null)?.code

    if (code === "P2003") {
      return NextResponse.json(
        {
          status: "error",
          message:
            "Nelze smazat uživatele, protože má propojená data v systému.",
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      {
        status: "error",
        message: "Došlo k neočekávané chybě při mazání uživatele.",
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const access = await requireUserManagementAccess()

  if ("error" in access) {
    return access.error
  }

  const currentUser = access.session.user

  try {
    const body = (await req.json().catch(() => null)) as {
      userId?: unknown
      updates?: Record<string, unknown>
    } | null

    const userId = typeof body?.userId === "string" ? body.userId : null
    const updates = body?.updates

    if (!userId) {
      return NextResponse.json(
        {
          status: "error",
          message: "ID uživatele je povinné.",
        },
        { status: 400 }
      )
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        {
          status: "error",
          message: "Chybí data k aktualizaci.",
        },
        { status: 400 }
      )
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        {
          status: "error",
          message: "Uživatel nenalezen.",
        },
        { status: 404 }
      )
    }

    const protectedEmails = getProtectedEmails()
    const targetEmail = targetUser.email.trim().toLowerCase()
    const isProtected = protectedEmails.has(targetEmail)

    const data: Prisma.UserUpdateInput = {}

    if (typeof updates.name === "string") {
      data.name = updates.name.trim() || null
    }

    if (typeof updates.surname === "string") {
      data.surname = updates.surname.trim() || null
    }

    if (typeof updates.email === "string") {
      if (isProtected) {
        return NextResponse.json(
          {
            status: "error",
            message:
              "E-mail uživatele definovaného v ENV nelze měnit přes administraci.",
          },
          { status: 403 }
        )
      }

      data.email = updates.email.trim().toLowerCase()
    }

    if (updates.role !== undefined) {
      if (!isValidRole(updates.role)) {
        return NextResponse.json(
          {
            status: "error",
            message: "Neplatná role.",
          },
          { status: 400 }
        )
      }

      if (isProtected) {
        return NextResponse.json(
          {
            status: "error",
            message:
              "Role tohoto uživatele je definována v ENV a nelze ji měnit přes administraci.",
          },
          { status: 403 }
        )
      }

      if (userId === currentUser.id && updates.role !== Role.ADMIN) {
        return NextResponse.json(
          {
            status: "error",
            message:
              "Nemůžete sama sobě odebrat administrátorskou roli přes toto rozhraní.",
          },
          { status: 409 }
        )
      }

      data.role = updates.role
      data.canAccessApp = updates.role !== Role.USER
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Žádná platná pole k aktualizaci.",
        },
        { status: 400 }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        canAccessApp: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      status: "success",
      message: "Uživatel byl úspěšně aktualizován.",
      data: updatedUser,
    })
  } catch (error) {
    console.error("Chyba při aktualizaci uživatele:", error)

    return NextResponse.json(
      {
        status: "error",
        message: "Nepodařilo se aktualizovat uživatele.",
      },
      { status: 500 }
    )
  }
}
