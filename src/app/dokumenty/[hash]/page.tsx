import { prisma } from "@/lib/db"
import { buildEmployeeMeta } from "@/lib/employee-meta"

import { PublicDocumentShell } from "./public-document-shell"
import {
  PublicDocumentInvalid,
  PublicDocumentThankYou,
} from "./public-document-status"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"
export const revalidate = 0

type PageProps = { params: { hash: string } }

export default async function PublicDocumentPage({ params }: PageProps) {
  const { hash } = params

  const doc = await prisma.employmentDocument.findUnique({
    where: { accessHash: hash },
    select: {
      id: true,
      type: true,
      status: true,
      expiresAt: true,
      onboarding: {
        select: {
          titleBefore: true,
          name: true,
          surname: true,
          titleAfter: true,
          department: true,
          unitName: true,
          positionName: true,
        },
      },
    },
  })

  const isExpired = !!doc?.expiresAt && doc.expiresAt < new Date()

  if (doc && doc.status !== "DRAFT" && !isExpired) {
    return <PublicDocumentThankYou />
  }

  if (!doc || isExpired) {
    return <PublicDocumentInvalid />
  }

  const employeeMeta = doc.onboarding
    ? buildEmployeeMeta(doc.onboarding)
    : undefined

  return (
    <main className="flex min-h-screen flex-col items-center bg-slate-50 py-10">
      <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-sm">
        <PublicDocumentShell
          documentId={doc.id}
          hash={hash}
          type={doc.type}
          employeeMeta={employeeMeta}
        />
      </div>
    </main>
  )
}
