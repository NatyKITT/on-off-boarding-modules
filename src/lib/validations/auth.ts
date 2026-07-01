import * as z from "zod"





export const userAuthSchema = z.object({
  email: z.string().trim().toLowerCase().email("Zadejte platný e-mail."),
})

export type UserAuthFormInput = z.infer<typeof userAuthSchema>

export const linkOAuthAccountSchema = z.object({
  userId: z.string().min(1),
  provider: z.string().min(1),
  providerAccountId: z.string().min(1),
})

export type LinkOAuthAccountInput = z.infer<typeof linkOAuthAccountSchema>
