import { requireAdmin } from "@/lib/session"

import { DashboardHeader } from "@/components/dashboard/header"
import { UserRoleManagement } from "@/components/forms/user-role-management"

export default async function AdminPage() {
  await requireAdmin()

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
