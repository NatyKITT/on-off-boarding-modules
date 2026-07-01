import { Role as PrismaRole } from "@prisma/client"
import * as z from "zod"

export const roleSchema = z.nativeEnum(PrismaRole)

export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().max(64, "Jméno je příliš dlouhé").optional().nullable(),
  surname: z
    .string()
    .max(64, "Příjmení je příliš dlouhé")
    .optional()
    .nullable(),
  role: roleSchema,
  canAccessApp: z.boolean().optional(),
  createdAt: z.date().optional(),
})

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Zadejte platný e-mail."),
  role: roleSchema.default(PrismaRole.USER),
})

export const getUserByEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

export const getUserByIdSchema = z.object({
  id: z.string().min(1),
})

export const updateUserRoleSchema = z.object({
  id: z.string().min(1),
  role: roleSchema,
})

export const removeUserSchema = z.object({
  id: z.string().min(1),
})

export const checkIfUserExistsSchema = z.object({
  id: z.string().min(1),
})

export const updateUserNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Jméno je povinné")
    .max(64, "Jméno je příliš dlouhé"),
})

export type AppRole = z.infer<typeof roleSchema>
export type UserSchema = z.infer<typeof userSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type GetUserByEmailInput = z.infer<typeof getUserByEmailSchema>
export type GetUserByIdInput = z.infer<typeof getUserByIdSchema>
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>
export type RemoveUserInput = z.infer<typeof removeUserSchema>
export type CheckIfUserExistsInput = z.infer<typeof checkIfUserExistsSchema>
export type UpdateUserNameSchema = z.infer<typeof updateUserNameSchema>
