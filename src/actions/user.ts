"use server"

import type { User } from "@prisma/client"

import { prisma } from "@/lib/db"
import {
  getUserByEmailSchema,
  getUserByIdSchema,
  type GetUserByEmailInput,
  type GetUserByIdInput,
} from "@/lib/validations/user"

export async function getUserByEmailAction(
  raw: GetUserByEmailInput
): Promise<User | null> {
  const parsed = getUserByEmailSchema.safeParse(raw)
  if (!parsed.success) return null
  try {
    return await prisma.user.findUnique({ where: { email: parsed.data.email } })
  } catch (e) {
    console.error("getUserByEmailAction error:", e)
    return null
  }
}

export async function getUserByIdAction(
  raw: GetUserByIdInput
): Promise<User | null> {
  const parsed = getUserByIdSchema.safeParse(raw)
  if (!parsed.success) return null
  try {
    return await prisma.user.findUnique({ where: { id: parsed.data.id } })
  } catch (e) {
    console.error("getUserByIdAction error:", e)
    return null
  }
}
