"use server"

import { prisma } from "@/lib/db"
import {
  linkOAuthAccountSchema,
  type LinkOAuthAccountInput,
} from "@/lib/validations/auth"

export async function linkOAuthAccount(
  rawInput: LinkOAuthAccountInput
): Promise<void> {
  try {
    const validatedInput = linkOAuthAccountSchema.safeParse(rawInput)
    if (!validatedInput.success) return

    await prisma.user.update({
      where: {
        id: validatedInput.data.userId,
      },
      data: {
        emailVerified: new Date(),
      },
    })
  } catch (error) {
    console.error("Chyba při propojení OAuth účtu:", error)
    throw new Error("Nepodařilo se propojit OAuth účet")
  }
}
