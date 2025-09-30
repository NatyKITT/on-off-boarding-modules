import { NextRequest } from "next/server"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

type Role = "USER" | "HR" | "IT" | "ADMIN" | undefined

const ADMIN_ROLES = new Set<Role>(["ADMIN", "IT"])

async function isAdminByUserId(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  return ADMIN_ROLES.has(user?.role as Role)
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ status: "error", message: "Nejste přihlášeni." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const isAdmin = await isAdminByUserId(session.user.id)
  if (!isAdmin) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nemáte oprávnění k této operaci.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    })

    return new Response(JSON.stringify({ status: "success", data: users }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: unknown) {
    console.error("Chyba při načítání uživatelů:", error)
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nepodařilo se načíst seznam uživatelů.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

// -------- DELETE (admin only)
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ status: "error", message: "Nejste přihlášeni." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const isAdmin = await isAdminByUserId(session.user.id)
  if (!isAdmin) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nemáte oprávnění mazat uživatele.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    const { searchParams } = new URL(req.url)
    const targetUserId = searchParams.get("userId")
    if (!targetUserId) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "ID uživatele je povinné.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    if (targetUserId === session.user.id) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Nelze smazat svůj vlastní účet.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true, name: true, surname: true },
    })
    if (!targetUser) {
      return new Response(
        JSON.stringify({ status: "error", message: "Uživatel nenalezen." }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const hasActiveOffboardings = await prisma.employeeOffboarding.count({
      where: {
        OR: [{ userEmail: targetUser.email }, { personalNumber: targetUserId }],
        status: { in: ["NEW", "IN_PROGRESS"] },
        deletedAt: null,
      },
    })
    if (hasActiveOffboardings > 0) {
      return new Response(
        JSON.stringify({
          status: "error",
          message:
            "Nelze smazat uživatele - má aktivní procesy odchodů. Nejprve je dokončete.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    await prisma.$transaction(async (tx) => {
      await tx.employeeOffboarding.updateMany({
        where: {
          OR: [
            { userEmail: targetUser.email },
            { personalNumber: targetUserId },
          ],
        },
        data: {
          userEmail: null,
          notes: `Uživatelský účet byl smazán (admin: ${session.user.id})`,
        },
      })

      await tx.user.delete({ where: { id: targetUserId } })
    })

    console.log(
      `Admin ${session.user.id} deleted user: ${targetUserId} (${targetUser.email})`
    )

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Uživatel ${targetUser.name} ${targetUser.surname} byl úspěšně smazán.`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (error: unknown) {
    console.error("Chyba při mazání uživatele:", error)
    const code = (error as { code?: string } | null)?.code
    if (code === "P2003") {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Nelze smazat uživatele - má propojená data v systému.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Došlo k neočekávané chybě při mazání uživatele.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

// -------- PUT (admin only)
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ status: "error", message: "Nejste přihlášeni." }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const isAdmin = await isAdminByUserId(session.user.id)
  if (!isAdmin) {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nemáte oprávnění upravovat uživatele.",
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    const body = await req.json()
    const { userId, updates } = body as {
      userId?: string
      updates?: Record<string, unknown>
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "ID uživatele je povinné.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const allowedFields = new Set(["name", "surname", "email", "role"])
    const filteredUpdates: Record<string, unknown> = {}
    Object.keys(updates ?? {}).forEach((key) => {
      if (allowedFields.has(key))
        filteredUpdates[key] = (updates as Record<string, unknown>)[key]
    })

    if (Object.keys(filteredUpdates).length === 0) {
      return new Response(
        JSON.stringify({
          status: "error",
          message: "Žádná platná pole k aktualizaci.",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: filteredUpdates,
      select: { id: true, name: true, surname: true, email: true, role: true },
    })

    console.log(
      `Admin ${session.user.id} updated user ${userId}:`,
      JSON.stringify(filteredUpdates)
    )

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Uživatel byl úspěšně aktualizován.",
        data: updatedUser,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (error: unknown) {
    console.error("Chyba při aktualizaci uživatele:", error)
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Nepodařilo se aktualizovat uživatele.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
