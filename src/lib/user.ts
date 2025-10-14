import { prisma } from "@/lib/db"

export const getUserByEmail = async (email: string) => {
  try {
    return await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    })
  } catch {
    return null
  }
}

export const getUserById = async (id: string) => {
  try {
    return await prisma.user.findUnique({ where: { id } })
  } catch {
    return null
  }
}
