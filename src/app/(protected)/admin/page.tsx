import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { UserRoleManagement } from "@/components/forms/user-role-management"

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
        text="Správa uživatelských rolí a oprávnění."
      />
      <div className="flex flex-col gap-5">
        <UserRoleManagement />
      </div>
    </>
  )
}
