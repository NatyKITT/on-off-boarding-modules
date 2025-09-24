import { PrismaAdapter } from "@auth/prisma-adapter"
import { Role } from "@prisma/client"
import type { NextAuthConfig } from "next-auth"
import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

import { env } from "@/env.mjs"

import { prisma } from "@/lib/db"
import { getUserById } from "@/lib/user"

const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/signin",
  },
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "id" in user) {
        token.id = user.id
      }

      if (!token.role && token.sub) {
        const dbUser = await getUserById(token.sub)
        if (dbUser?.role) token.role = dbUser.role
      }

      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id!
        session.user.role = token.role as Role
      }
      return session
    },
  },
  debug: env.NODE_ENV === "development",
}

export const {
  handlers: { GET, POST },
  auth,
} = NextAuth(authConfig)
