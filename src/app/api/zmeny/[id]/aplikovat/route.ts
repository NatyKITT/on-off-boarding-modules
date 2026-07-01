import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { EmployeeChangeStatus, EmployeeChangeTargetType } from "@prisma/client"

import { prisma } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function POST(
  _: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { status: "error", message: "Nejste přihlášeni." },
      { status: 401 }
    )
  }

  const id = Number(params.id)
  if (!Number.isFinite(id)) {
    return NextResponse.json(
      { status: "error", message: "Neplatné ID." },
      { status: 400 }
    )
  }

  const userKey =
    (session.user as { id?: string; email?: string }).id ??
    session.user.email ??
    "unknown"

  try {
    const change = await prisma.employeeChange.findUnique({
      where: { id, deletedAt: null },
    })

    if (!change) {
      return NextResponse.json(
        { status: "error", message: "Záznam nenalezen." },
        { status: 404 }
      )
    }

    if (change.status === EmployeeChangeStatus.APPLIED) {
      return NextResponse.json(
        { status: "error", message: "Změna je již propojena." },
        { status: 409 }
      )
    }

    if (!change.personalNumber?.trim()) {
      return NextResponse.json(
        {
          status: "error",
          message: "Změna nemá osobní číslo — nelze propojit.",
        },
        { status: 400 }
      )
    }

    const pn = change.personalNumber.trim()
    const isNameChange =
      change.type === "NAME" || change.type === "NAME_AND_POSITION"
    const isPosChange =
      change.type === "POSITION" || change.type === "NAME_AND_POSITION"

    const [onboardings, offboardings] = await Promise.all([
      prisma.employeeOnboarding.findMany({
        where: { personalNumber: pn, deletedAt: null },
      }),
      prisma.employeeOffboarding.findMany({
        where: { personalNumber: pn, deletedAt: null },
      }),
    ])

    if (onboardings.length === 0 && offboardings.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          message: "Žádné záznamy se shodným osobním číslem nebyly nalezeny.",
        },
        { status: 404 }
      )
    }

    const nameUpdate = isNameChange
      ? {
          ...(change.newTitleBefore !== null
            ? { titleBefore: change.newTitleBefore }
            : {}),
          ...(change.newName !== null ? { name: change.newName } : {}),
          ...(change.newSurname !== null ? { surname: change.newSurname } : {}),
          ...(change.newTitleAfter !== null
            ? { titleAfter: change.newTitleAfter }
            : {}),
        }
      : {}

    const posUpdate = isPosChange
      ? {
          ...(change.newPositionName !== null
            ? { positionName: change.newPositionName }
            : {}),
          ...(change.newPositionNum !== null
            ? { positionNum: change.newPositionNum }
            : {}),
          ...(change.newDepartment !== null
            ? { department: change.newDepartment }
            : {}),
          ...(change.newUnitName !== null
            ? { unitName: change.newUnitName }
            : {}),
        }
      : {}

    const updateData = { ...nameUpdate, ...posUpdate }

    await prisma.$transaction(async (tx) => {
      for (const onb of onboardings) {
        const oldValues = {
          name: onb.name,
          surname: onb.surname,
          titleBefore: onb.titleBefore,
          titleAfter: onb.titleAfter,
          positionName: onb.positionName,
          positionNum: onb.positionNum,
          department: onb.department,
          unitName: onb.unitName,
        }

        if (Object.keys(updateData).length > 0) {
          await tx.employeeOnboarding.update({
            where: { id: onb.id },
            data: { ...updateData, updatedAt: new Date() },
          })
        }

        await tx.employeeChangeTarget.create({
          data: {
            changeId: id,
            targetType: EmployeeChangeTargetType.ONBOARDING,
            targetId: onb.id,
            oldValues: oldValues,
            newValues: updateData,
            appliedAt: new Date(),
            appliedBy: userKey,
          },
        })
      }

      for (const off of offboardings) {
        const oldValues = {
          name: off.name,
          surname: off.surname,
          titleBefore: off.titleBefore,
          titleAfter: off.titleAfter,
          positionName: off.positionName,
          positionNum: off.positionNum,
          department: off.department,
          unitName: off.unitName,
        }

        if (Object.keys(updateData).length > 0) {
          await tx.employeeOffboarding.update({
            where: { id: off.id },
            data: { ...updateData, updatedAt: new Date() },
          })
        }

        await tx.employeeChangeTarget.create({
          data: {
            changeId: id,
            targetType: EmployeeChangeTargetType.OFFBOARDING,
            targetId: off.id,
            oldValues: oldValues,
            newValues: updateData,
            appliedAt: new Date(),
            appliedBy: userKey,
          },
        })
      }

      await tx.employeeChange.update({
        where: { id },
        data: {
          status: EmployeeChangeStatus.APPLIED,
          appliedAt: new Date(),
          appliedBy: userKey,
          updatedAt: new Date(),
        },
      })
    })

    return NextResponse.json({
      status: "success",
      message: "Změna byla úspěšně propojena se záznamy.",
      data: {
        appliedToOnboarding: onboardings.length,
        appliedToOffboarding: offboardings.length,
      },
    })
  } catch (err) {
    console.error("POST /api/zmeny/[id]/aplikovat error:", err)
    return NextResponse.json(
      { status: "error", message: "Chyba při propojování změny." },
      { status: 500 }
    )
  }
}
