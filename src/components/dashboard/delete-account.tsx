"use client"

import { useSession } from "next-auth/react"

import { siteConfig } from "@/config/site"

import { Button } from "@/components/ui/button"
import { SectionColumns } from "@/components/dashboard/section-columns"
import { useDeleteAccountModal } from "@/components/modals/delete-account-modal"
import { Icons } from "@/components/shared/icons"

export function DeleteAccountSection() {
  const { data: session } = useSession()
  const { setShowDeleteAccountModal, DeleteAccountModal } =
    useDeleteAccountModal()

  const userRole = session?.user?.role
  if (!userRole || !["ADMIN"].includes(userRole)) return null

  return (
    <>
      <DeleteAccountModal />
      <SectionColumns
        title="Smazání účtu"
        description="Nebezpečná oblast – pokračujte opatrně!"
      >
        <div className="flex flex-col gap-4 rounded-xl border border-red-400 p-4 dark:border-red-900">
          <div className="flex flex-col gap-2">
            <div className="text-[15px] font-medium">
              Opravdu si přejete účet smazat?
            </div>
            <div className="text-balance text-sm text-muted-foreground">
              Trvalé smazání vašeho účtu {siteConfig.name}. Tento krok je
              nevratný – pokračujte pouze pokud jste si jisti.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              variant="destructive"
              onClick={() => setShowDeleteAccountModal(true)}
            >
              <Icons.trash className="mr-2 size-4" />
              <span>Smazat účet</span>
            </Button>
          </div>
        </div>
      </SectionColumns>
    </>
  )
}
