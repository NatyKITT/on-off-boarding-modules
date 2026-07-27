import { NextRequest, NextResponse } from "next/server"
import { Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { canManageUsers } from "@/lib/rbac"
import { getCurrentUser } from "@/lib/session"
import { logUserAudit } from "@/lib/user-audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || !canManageUsers(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as {
      role?: unknown
    } | null

    const newRole = body?.role

    if (!isValidRole(newRole)) {
      return NextResponse.json({ error: "Neplatná role." }, { status: 400 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        role: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "Uživatel nebyl nalezen." },
        { status: 404 }
      )
    }

    const protectedEmails = getProtectedEmails()
    const targetEmail = targetUser.email.trim().toLowerCase()

    if (protectedEmails.has(targetEmail)) {
      return NextResponse.json(
        {
          error:
            "Role tohoto uživatele je definována v ENV a nelze ji změnit přes administraci.",
        },
        { status: 403 }
      )
    }

    if (targetUser.id === currentUser.id && newRole !== Role.ADMIN) {
      return NextResponse.json(
        {
          error:
            "Nemůžete sama sobě odebrat administrátorskou roli přes toto rozhraní.",
        },
        { status: 409 }
      )
    }

    const canAccessApp = newRole !== Role.USER

    const updatedUser = await prisma.user.update({
      where: { id: params.id },
      data: {
        role: newRole,
        canAccessApp,
      },
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

    if (newRole === Role.USER) {
      await prisma.session.deleteMany({
        where: { userId: targetUser.id },
      })
    }

    await logUserAudit({
      targetUserId: targetUser.id,
      targetEmail: targetUser.email,
      action: "ROLE_CHANGED",
      oldValue: targetUser.role,
      newValue: newRole,
      by: currentUser.id ?? null,
      byName: currentUser.name ?? currentUser.email ?? null,
      byEmail: currentUser.email ?? null,
    })

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error) {
    console.error("Error updating user role:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const currentUser = await getCurrentUser()

    if (!currentUser || !canManageUsers(currentUser.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        role: true,
      },
    })

    if (!targetUser) {
      return NextResponse.json(
        { error: "Uživatel nebyl nalezen." },
        { status: 404 }
      )
    }

    const protectedEmails = getProtectedEmails()
    const targetEmail = targetUser.email.trim().toLowerCase()

    if (protectedEmails.has(targetEmail)) {
      return NextResponse.json(
        {
          error:
            "Tento uživatel je definovaný v ENV a nelze ho odebrat přes administraci.",
        },
        { status: 403 }
      )
    }

    if (targetUser.id === currentUser.id) {
      return NextResponse.json(
        {
          error: "Nemůžete odebrat sama sebe.",
        },
        { status: 409 }
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

      await logUserAudit({
        targetUserId: targetUser.id,
        targetEmail: targetUser.email,
        action: "DEMOTED",
        oldValue: targetUser.role,
        newValue: Role.USER,
        by: currentUser.id ?? null,
        byName: currentUser.name ?? currentUser.email ?? null,
        byEmail: currentUser.email ?? null,
      })

      return NextResponse.json({
        success: true,
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
      prisma.user.delete({
        where: { id: targetUser.id },
      }),
    ])

    await logUserAudit({
      targetUserId: null,
      targetEmail: targetUser.email,
      action: "REMOVED",
      oldValue: targetUser.role,
      by: currentUser.id ?? null,
      byName: currentUser.name ?? currentUser.email ?? null,
      byEmail: currentUser.email ?? null,
    })

    return NextResponse.json({
      success: true,
      action: "deleted",
      message: "Uživatel byl odstraněn.",
    })
  } catch (error) {
    console.error("Error removing user:", error)

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
