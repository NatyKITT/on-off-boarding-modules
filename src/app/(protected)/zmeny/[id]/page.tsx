import { notFound, redirect } from "next/navigation"
import { auth } from "@/auth"

import { prisma } from "@/lib/db"

import { EmployeeChangeDetailClient } from "./employee-change-detail-client"

interface PageProps {
  params: { id: string }
}

export default async function EmployeeChangeDetailPage({ params }: PageProps) {
  const session = await auth()
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(`/zmeny/${params.id}`)}`)
  }

  const id = Number(params.id)
  if (Number.isNaN(id)) notFound()

  const record = await prisma.employeeChange.findUnique({
    where: { id, deletedAt: null },
    include: {
      targets: {
        select: {
          id: true,
          targetType: true,
          targetId: true,
          appliedAt: true,
          appliedBy: true,
        },
      },
    },
  })

  if (!record) notFound()

  const data = {
    ...record,
    effectiveDate: record.effectiveDate.toISOString(),
    appliedAt: record.appliedAt?.toISOString() ?? null,
    emailSentAt: record.emailSentAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    targets: record.targets.map((t) => ({
      ...t,
      appliedAt: t.appliedAt.toISOString(),
    })),
  }

  return <EmployeeChangeDetailClient data={data} />
}
