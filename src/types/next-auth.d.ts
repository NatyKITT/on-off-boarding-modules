import type { Role } from "@prisma/client"
import type { DefaultSession, DefaultUser } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string
      role: Role
      canAccessApp: boolean
      name?: string | null
    }
  }

  interface User extends DefaultUser {
    role?: Role | null
    canAccessApp?: boolean | null
    name?: string | null
    surname?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: Role
    canAccessApp?: boolean
    email?: string | null
    name?: string | null
  }
}
