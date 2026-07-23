import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"

const DEFAULT_ALLOWED_DOMAINS = ["kitt6.cz", "praha6.cz"] as const

const ALLOWED_DOMAINS: ReadonlySet<string> = new Set(DEFAULT_ALLOWED_DOMAINS)

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

function parseEmails(envValue: string | undefined): ReadonlySet<string> {
  return new Set(parseCsv(envValue))
}

const SUPER_ADMIN_EMAILS = parseEmails(process.env.SUPER_ADMIN_EMAILS)
const HR_EMAILS = parseEmails(process.env.HR_EMAILS)
const IT_EMAILS = parseEmails(process.env.IT_EMAILS)
const READONLY_EMAILS = parseEmails(process.env.READONLY_EMAILS)

function getDomain(email: string | null | undefined): string {
  if (!email) return ""
  return email.split("@")[1]?.toLowerCase() ?? ""
}

function isInternalRole(role: Role | null | undefined): boolean {
  return (
    role === "ADMIN" || role === "HR" || role === "IT" || role === "READONLY"
  )
}

function getEnvRoleForEmail(email: string): Role | null {
  const lower = email.toLowerCase()

  if (SUPER_ADMIN_EMAILS.has(lower)) return "ADMIN"
  if (HR_EMAILS.has(lower)) return "HR"
  if (IT_EMAILS.has(lower)) return "IT"
  if (READONLY_EMAILS.has(lower)) return "READONLY"

  return null
}

function getDefaultRoleForEmail(email: string): Role {
  const domain = getDomain(email)

  if (domain === "kitt6.cz") {
    return "IT"
  }

  return "USER"
}

function canEmailSignIn(email: string | null | undefined): boolean {
  const domain = getDomain(email)
  if (!domain) return false

  return ALLOWED_DOMAINS.has(domain)
}

function resolveRoleForUser(params: {
  email: string
  dbRole?: Role | null
  dbCanAccessApp?: boolean | null
}): Role {
  const envRole = getEnvRoleForEmail(params.email)

  if (envRole) {
    return envRole
  }

  if (params.dbRole && isInternalRole(params.dbRole)) {
    return params.dbRole
  }

  if (params.dbRole === "USER") {
    return "USER"
  }

  return getDefaultRoleForEmail(params.email)
}

async function syncUserAccess(userId: string, email: string) {
  const normalizedEmail = email.toLowerCase()

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      canAccessApp: true,
      name: true,
      surname: true,
      email: true,
    },
  })

  if (!dbUser) return null

  const nextRole = resolveRoleForUser({
    email: normalizedEmail,
    dbRole: dbUser.role,
    dbCanAccessApp: dbUser.canAccessApp,
  })

  const nextCanAccessApp = isInternalRole(nextRole)

  if (dbUser.role !== nextRole || dbUser.canAccessApp !== nextCanAccessApp) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: nextRole,
        canAccessApp: nextCanAccessApp,
      },
    })
  }

  return {
    ...dbUser,
    role: nextRole,
    canAccessApp: nextCanAccessApp,
  }
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),

  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
    updateAge: 60 * 60,
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
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  events: {
    async signIn({ user }) {
      try {
        const userId = user.id ? String(user.id) : null
        const email = user.email?.toLowerCase() ?? null

        if (!userId || !email) return

        await syncUserAccess(userId, email)
      } catch (error) {
        console.warn("[auth signIn syncUserAccess] Non-fatal error:", error)
      }
    },
  },

  callbacks: {
    authorized() {
      return true
    },

    async signIn({ profile }) {
      const email =
        typeof profile?.email === "string" ? profile.email.toLowerCase() : null

      if (!canEmailSignIn(email)) {
        return false
      }

      const googleProfile = profile as
        | { email_verified?: boolean | null }
        | undefined

      if (googleProfile?.email_verified === false) {
        return false
      }

      return true
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`

      try {
        if (new URL(url).origin === new URL(baseUrl).origin) return url
      } catch {}

      return baseUrl
    },

    async jwt({ token, user, profile }) {
      const email =
        (typeof token.email === "string" && token.email) ||
        (typeof user?.email === "string" && user.email) ||
        (typeof profile?.email === "string" && profile.email) ||
        null

      if (email) {
        token.email = email.toLowerCase()
      }

      const userId =
        user && "id" in user
          ? String(user.id)
          : token.sub
            ? String(token.sub)
            : null

      if (userId) {
        token.id = userId
      }

      if (user?.name && !token.name) {
        token.name = user.name
      }

      if (userId && token.email) {
        const dbUser = await syncUserAccess(userId, String(token.email))

        if (dbUser) {
          token.role = dbUser.role
          token.canAccessApp = dbUser.canAccessApp

          if (!token.name && (dbUser.name || dbUser.surname)) {
            token.name = [dbUser.name, dbUser.surname].filter(Boolean).join(" ")
          }
        }
      }

      if (!token.role) {
        token.role = "USER"
      }

      if (typeof token.canAccessApp === "undefined") {
        token.canAccessApp = false
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "")
        session.user.email =
          (token.email as string | null) ?? session.user.email
        session.user.role = token.role as Role
        session.user.canAccessApp = Boolean(token.canAccessApp)

        if (token.name) {
          session.user.name = token.name as string
        }
      }

      return session
    },
  },
} satisfies NextAuthConfig

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
