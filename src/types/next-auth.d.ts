import { Role } from "@prisma/client"
import { User } from "next-auth"

export type ExtendedUser = User & {
  role: Role
  id: string
}

declare module "next-auth" {
  interface Session {
    user: ExtendedUser
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: Role
  }
}
