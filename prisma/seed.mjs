import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const email = "admin@example.com"
  const existing = await prisma.user.findUnique({ where: { email } })

  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        name: "Admin",
        surname: "User",
        role: "ADMIN",
      },
    })
    console.log(`✅ Admin vytvořen: ${email}`)
  } else {
    console.log("ℹ️  Admin už existuje, seed přeskočen.")
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
