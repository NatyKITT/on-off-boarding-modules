import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { UpdateUserNameForm } from "@/components/forms/update-user-name-form"
import { UpdateUserRoleForm } from "@/components/forms/update-user-role-form"

export default async function DashboardSettingsPage() {
  const user = await getCurrentUser()

  if (!user?.id) {
    redirect("/signin")
  }

  const isAdmin = user.role === "ADMIN"

  return (
    <>
      <DashboardHeader
        heading="Nastavení"
        text="Změna jména, role a správa účtu."
      />
      <div className="divide-y divide-muted pb-10">
        <UpdateUserNameForm user={{ id: user.id, name: user.name || "" }} />
        {isAdmin && (
          <UpdateUserRoleForm user={{ id: user.id, role: user.role }} />
        )}
      </div>
    </>
  )
}
