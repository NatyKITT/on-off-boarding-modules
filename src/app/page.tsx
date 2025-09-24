import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

export default async function HomePage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/signin")
  }

  if (user.role === "ADMIN") {
    redirect("/admin")
  }

  redirect("/prehled")
}
