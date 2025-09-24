import { redirect } from "next/navigation"

import { getCurrentUser } from "@/lib/session"
import { constructMetadata } from "@/lib/utils"

import { DeleteAccountSection } from "@/components/dashboard/delete-account"
import { DashboardHeader } from "@/components/dashboard/header"
import { UpdateUserNameForm } from "@/components/forms/update-user-name-form"
import { UpdateUserRoleForm } from "@/components/forms/update-user-role-form"

export const metadata = constructMetadata({
  title: "Nastavení – Onboarding",
  description: "Změna uživatelského jména, role a nastavení účtu.",
})

export default async function DashboardSettingsPage() {
  const user = await getCurrentUser()

  if (!user?.id) redirect("/signin")

  return (
    <>
      <DashboardHeader
        heading="Nastavení"
        text="Změna jména, role a správa účtu."
      />
      <div className="divide-y divide-muted pb-10">
        <UpdateUserNameForm user={{ id: user.id, name: user.name || "" }} />
        <UpdateUserRoleForm user={{ id: user.id, role: user.role }} />
        <DeleteAccountSection />
      </div>
    </>
  )
}
