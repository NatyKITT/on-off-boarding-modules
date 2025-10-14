import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Role } from "@prisma/client"
import NextAuth, { type NextAuthConfig, type Session } from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import { getUserById } from "@/lib/user"

const ALLOWED_DOMAINS = new Set(["kitt6.cz", "praha6.cz"])

const authConfig: NextAuthConfig = {
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

  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email ?? ""
      const domain = email.split("@")[1]?.toLowerCase() ?? ""
      return ALLOWED_DOMAINS.has(domain)
    },

    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      if (pathname.startsWith("/signin")) return true
      return !!auth
    },

    async jwt({ token, user }) {
      if (user && "id" in user) token.id = user.id as string

      if (!token.role && token.sub) {
        const dbUser = await getUserById(token.sub)
        if (dbUser?.role) token.role = dbUser.role as Role
      }
      return token
    },

    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        ;(session.user as { id: string; role?: Role }).id = token.id
        if (token.role)
          (session.user as { role?: Role }).role = token.role as Role
      }
      return session as Session
    },
  },

  debug: process.env.NODE_ENV === "development",
}

export const {
  auth,
  signIn,
  signOut,
  handlers: { GET, POST },
} = NextAuth(authConfig)
