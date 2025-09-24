"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"
import { type Role } from "@prisma/client"

import { prisma } from "@/lib/db"
import { roleSchema } from "@/lib/validations/user"

export type FormData = {
  role: Role
}

export async function updateUserRole(userId: string, data: FormData) {
  try {
    const session = await auth()

    if (!session?.user || session.user.id !== userId) {
      throw new Error("Neautorizovaný přístup.")
    }

    const role = roleSchema.parse(data.role)

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        role: role,
      },
    })

    revalidatePath("/nastaveni")
    return { status: "success" }
  } catch (error) {
    console.error("Chyba při změně role:", error)
    return {
      status: "error",
      message: "Nepodařilo se změnit roli uživatele.",
    }
  }
}
