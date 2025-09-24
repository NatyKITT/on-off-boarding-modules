import * as z from "zod"

export const userAuthSchema = z.object({
  email: z.string().email(),
})

export type UserAuthFormInput = z.infer<typeof userAuthSchema>

export const linkOAuthAccountSchema = z.object({
  userId: z.string(),
  provider: z.string(),
  providerAccountId: z.string(),
})

export type LinkOAuthAccountInput = z.infer<typeof linkOAuthAccountSchema>
