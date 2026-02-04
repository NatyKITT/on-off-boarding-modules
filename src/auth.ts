import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import { getUserById } from "@/lib/user"

const isProd = process.env.NODE_ENV === "production"

const DEV_ALLOWED_DOMAINS = ["kitt6.cz", "praha6.cz"] as const
const PROD_ALLOWED_DOMAINS = ["praha6.cz"] as const

const ALLOWED_DOMAINS: ReadonlySet<string> = new Set(
  isProd ? PROD_ALLOWED_DOMAINS : DEV_ALLOWED_DOMAINS
)

const SUPER_ADMIN_EMAILS: ReadonlySet<string> = new Set(
  (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

const HR_EMAILS: ReadonlySet<string> = new Set(
  (process.env.HR_EMAILS ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

const IT_EMAILS: ReadonlySet<string> = new Set(
  (process.env.IT_EMAILS ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

const READONLY_EMAILS: ReadonlySet<string> = new Set(
  (process.env.READONLY_EMAILS ?? "")
    .split(/[;,]/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
)

function getDomain(email: string | null | undefined): string {
  if (!email) return ""
  return email.split("@")[1]?.toLowerCase() ?? ""
}

function isKitt6(email: string | null | undefined): boolean {
  return getDomain(email) === "kitt6.cz"
}

function isInternalRole(role: Role | null | undefined): boolean {
  return (
    role === "ADMIN" || role === "HR" || role === "IT" || role === "READONLY"
  )
}

function getRoleForEmail(email: string): Role {
  const lower = email.toLowerCase()

  if (isKitt6(lower) || SUPER_ADMIN_EMAILS.has(lower)) {
    return "ADMIN"
  }
  if (HR_EMAILS.has(lower)) {
    return "HR"
  }
  if (IT_EMAILS.has(lower)) {
    return "IT"
  }
  if (READONLY_EMAILS.has(lower)) {
    return "READONLY"
  }

  return "USER"
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 0,
  },

  trustHost: true,
  secret: env.AUTH_SECRET,

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: false,
    }),
  ],

  events: {
    async signIn({ user }) {
      try {
        const email = user.email?.toLowerCase() ?? ""
        if (!email) return

        const assignedRole = getRoleForEmail(email)

        const existingUser = await prisma.user.findUnique({
          where: { id: String(user.id) },
          select: { role: true, canAccessApp: true },
        })

        if (assignedRole !== "USER") {
          await prisma.user.update({
            where: { id: String(user.id) },
            data: {
              role: assignedRole,
              canAccessApp: true,
            },
          })
        } else if (!existingUser || !existingUser.role) {
          await prisma.user.update({
            where: { id: String(user.id) },
            data: {
              role: "USER",
              canAccessApp: false,
            },
          })
        }
      } catch (e) {
        console.warn("signIn role sync (non-fatal):", e)
      }
    },
  },

  callbacks: {
    authorized() {
      return true
    },

    async signIn({ profile }) {
      const email = profile?.email ?? ""
      const domain = getDomain(email)
      return ALLOWED_DOMAINS.has(domain)
    },

    async jwt({ token, user, profile }) {
      const email =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" && user.email) ||
        (typeof profile?.email === "string" && profile.email) ||
        null

      if (email) token.email = email

      const userId =
        user && "id" in user
          ? String(user.id)
          : token.sub
            ? String(token.sub)
            : null
      if (userId) token.id = userId

      if (
        userId &&
        (!token.role || typeof token.canAccessApp === "undefined")
      ) {
        const dbUser = await getUserById(userId)
        if (dbUser) {
          token.role = dbUser.role as Role
          token.canAccessApp = isInternalRole(dbUser.role)
            ? true
            : (dbUser.canAccessApp ?? false)
        }
      }

      if (token.email) {
        const assignedRole = getRoleForEmail(token.email)
        if (assignedRole !== "USER") {
          token.role = assignedRole
          token.canAccessApp = true
        }
      }

      if (!token.role) token.role = "USER"
      if (typeof token.canAccessApp === "undefined") token.canAccessApp = false

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "")
        session.user.email =
          (token.email as string | null) ?? session.user.email
        session.user.role = token.role as Role
        session.user.canAccessApp = Boolean(token.canAccessApp)
      }
      return session
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
