"use server"

import { revalidatePath } from "next/cache"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"
import { userSchema } from "@/lib/validations/user"

export type FormData = {
  name: string
}

export async function updateUserName(userId: string, data: FormData) {
  try {
    const session = await auth()

    if (!session?.user || session.user.id !== userId) {
      throw new Error("Neautorizovaný přístup.")
    }

    const { name } = userSchema.parse(data)

    await prisma.user.update({
      where: { id: userId },
      data: { name },
    })

    revalidatePath("/nastaveni")
    return { status: "success" }
  } catch (error) {
    console.error("Chyba při aktualizaci jména:", error)
    return {
      status: "error",
      message: "Nepodařilo se uložit nové jméno.",
    }
  }
}
