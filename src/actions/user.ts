"use server"

import { type User } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  getUserByEmailSchema,
  getUserByIdSchema,
  type GetUserByEmailInput,
  type GetUserByIdInput,
} from "@/lib/validations/user"

export async function getUserByEmail(
  rawInput: GetUserByEmailInput
): Promise<User | null> {
  try {
    const validatedInput = getUserByEmailSchema.safeParse(rawInput)
    if (!validatedInput.success) return null

    return await prisma.user.findUnique({
      where: {
        email: validatedInput.data.email,
      },
    })
  } catch (error) {
    console.error("Chyba při načítání uživatele podle e-mailu:", error)
    throw new Error("Nepodařilo se získat uživatele podle e-mailu.")
  }
}

export async function getUserById(
  rawInput: GetUserByIdInput
): Promise<User | null> {
  try {
    const validatedInput = getUserByIdSchema.safeParse(rawInput)
    if (!validatedInput.success) return null

    return await prisma.user.findUnique({
      where: {
        id: validatedInput.data.id,
      },
    })
  } catch (error) {
    console.error("Chyba při načítání uživatele podle ID:", error)
    throw new Error("Nepodařilo se získat uživatele podle ID.")
  }
}
