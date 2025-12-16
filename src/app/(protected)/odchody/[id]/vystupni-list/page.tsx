import { notFound } from "next/navigation"

import type { ExitChecklistData } from "@/types/exit-checklist"

import { getSession } from "@/lib/session"

import { ExitChecklistForm } from "@/components/forms/exit-checklist-form"

type Props = { params: { id: string } }

export default async function ExitChecklistPage({ params }: Props) {
  const session = await getSession()
  if (!session?.user) {
    notFound()
  }

  const offId = Number(params.id)
  if (Number.isNaN(offId)) {
    notFound()
  }

  const res = await fetch(`/api/odchody/${offId}/exit-checklist`, {
    cache: "no-store",
  })

  if (!res.ok) {
    notFound()
  }

  const json = (await res.json()) as {
    status?: string
    data?: ExitChecklistData
  }

  if (!json.data) {
    notFound()
  }

  const data = json.data

  const canEditRole =
    session.user.role === "ADMIN" || session.user.role === "HR"
  const canEdit = canEditRole && !data.lockedAt

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <ExitChecklistForm
        offboardingId={offId}
        initialData={data}
        canEdit={canEdit}
      />
    </div>
  )
}
