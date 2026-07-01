import { requireAdmin } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { UpdateUserNameForm } from "@/components/forms/update-user-name-form"

export default async function DashboardSettingsPage() {
  const user = await requireAdmin()

  return (
    <>
      <DashboardHeader
        heading="Nastavení"
        text="Změna zobrazovaného jména administrátora."
      />

      <div className="divide-y divide-muted pb-10">
        <UpdateUserNameForm user={{ id: user.id, name: user.name || "" }} />
      </div>
    </>
  )
}
