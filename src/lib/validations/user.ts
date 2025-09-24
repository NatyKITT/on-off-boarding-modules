import { Role as PrismaRole } from "@prisma/client"
import * as z from "zod"

export const roleSchema = z.nativeEnum(PrismaRole)

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().min(1, "Jméno je povinné").max(32, "Jméno je příliš dlouhé"),
  role: roleSchema,
  createdAt: z.date().optional(),
})

export const getUserByEmailSchema = z.object({
  email: z.string().email(),
})

export const getUserByIdSchema = z.object({
  id: z.string(),
})

export const updateUserRoleSchema = z.object({
  id: z.string(),
  role: roleSchema,
})

export const checkIfUserExistsSchema = z.object({
  id: z.string(),
})

// Typy
export type AppRole = z.infer<typeof roleSchema>
export type GetUserByEmailInput = z.infer<typeof getUserByEmailSchema>
export type GetUserByIdInput = z.infer<typeof getUserByIdSchema>
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
export type CheckIfUserExistsInput = z.infer<typeof checkIfUserExistsSchema>
