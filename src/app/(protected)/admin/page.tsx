import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"

export default async function AdminPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect("/signin")
  }

  if (user.role !== "ADMIN") {
    redirect("/prehled")
  }

  return (
    <>
      <DashboardHeader
        heading="Administrace"
        text="Přístup pouze pro uživatele s rolí ADMIN."
      />
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          Placeholder
        </div>
      </div>
    </>
  )
}
