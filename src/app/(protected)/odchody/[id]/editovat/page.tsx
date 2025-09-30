"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { CheckCircle, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { OffboardingFormUnified } from "@/components/forms/offboarding-form"

type OffRow = {
  id: number
  titleBefore?: string | null
  name: string
  surname: string
  titleAfter?: string | null
  department: string
  unitName: string
  positionNum: string | null
  positionName: string
  plannedEnd: string
  actualEnd?: string | null
  noticeEnd?: string | null
  noticeMonths?: number | null
  hasCustomDates?: boolean
  userEmail?: string | null
  personalNumber?: string | null
  notes?: string | null
  status?: "NEW" | "IN_PROGRESS" | "COMPLETED"
}

interface PageProps {
  params: { id: string }
}

/* ----------------------- Modal Components ----------------------- */
interface SuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

const SuccessModal: React.FC<SuccessModalProps> = ({
  open,
  onOpenChange,
  title,
  message,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <div className="flex items-center gap-4">
        <CheckCircle className="size-12 text-green-500" />
        <div className="space-y-2">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button onClick={() => onOpenChange(false)}>OK</Button>
      </div>
    </DialogContent>
  </Dialog>
)

interface ErrorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
}

const ErrorModal: React.FC<ErrorModalProps> = ({
  open,
  onOpenChange,
  title,
  message,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <div className="flex items-center gap-4">
        <XCircle className="size-12 text-red-500" />
        <div className="space-y-2">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Zavřít
        </Button>
      </div>
    </DialogContent>
  </Dialog>
)

export default function OffboardingEditPage({ params }: PageProps) {
  const router = useRouter()

  const [loading, setLoading] = React.useState(true)
  const [row, setRow] = React.useState<OffRow | null>(null)

  const [successModal, setSuccessModal] = React.useState({
    open: false,
    title: "",
    message: "",
  })
  const [errorModal, setErrorModal] = React.useState({
    open: false,
    title: "",
    message: "",
  })

  const editContext: "planned" | "actual" = row?.actualEnd
    ? "actual"
    : "planned"

  const showSuccess = (title: string, message: string) => {
    setSuccessModal({ open: true, title, message })
  }

  const showError = (title: string, message: string) => {
    setErrorModal({ open: true, title, message })
  }

  React.useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setLoading(true)

        const recRes = await fetch(`/api/odchody/${params.id}`, {
          cache: "no-store",
        })

        const recJson = await recRes.json().catch(() => null)

        if (cancelled) return

        if (recRes.ok && recJson?.status === "success" && recJson.data) {
          setRow(recJson.data as OffRow)
        } else {
          showError("Nenalezeno", "Záznam odchodu se nepodařilo načíst.")
          router.replace("/odchody")
        }
      } catch (error) {
        console.error("Error loading edit data:", error)
        if (!cancelled) {
          showError("Chyba", "Nepodařilo se načíst data.")
          router.replace("/odchody")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params.id, router])

  return (
    <div className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Upravit odchod</h1>
        <Button variant="outline" onClick={() => router.push("/odchody")}>
          Zpět na přehled
        </Button>
      </div>

      <Card className="border-muted shadow-sm">
        <CardContent className="p-6">
          {loading || !row ? (
            <p className="text-sm text-muted-foreground">Načítám…</p>
          ) : (
            <OffboardingFormUnified
              key={`edit-${row.id}-${editContext}`}
              id={row.id}
              initial={{
                titleBefore: row.titleBefore || undefined,
                name: row.name,
                surname: row.surname,
                titleAfter: row.titleAfter || undefined,
                userEmail: row.userEmail || undefined,
                positionNum: row.positionNum || undefined,
                positionName: row.positionName || undefined,
                department: row.department || undefined,
                unitName: row.unitName || undefined,
                plannedEnd: row.plannedEnd
                  ? row.plannedEnd.slice(0, 10)
                  : undefined,
                actualEnd: row.actualEnd
                  ? row.actualEnd.slice(0, 10)
                  : undefined,
                personalNumber: row.personalNumber || undefined,
                notes: row.notes || undefined,
                status: row.status || undefined,
                noticeFiled: row.noticeEnd ? row.noticeEnd.slice(0, 10) : "",
                noticeEnd: row.noticeEnd
                  ? row.noticeEnd.slice(0, 10)
                  : undefined,
                noticeMonths: row.noticeMonths ?? undefined,
              }}
              mode="edit"
              editContext={editContext}
              onSuccess={() => {
                showSuccess("Změny uloženy", "Záznam byl úspěšně upraven.")
                setTimeout(() => {
                  router.push("/odchody")
                }, 1500)
              }}
            />
          )}
        </CardContent>
      </Card>

      {!loading && row && (
        <p className="mt-3 text-xs text-muted-foreground">
          Režim:{" "}
          <strong>
            {editContext === "planned" ? "Plánovaný" : "Skutečný"}
          </strong>
          {row.plannedEnd
            ? ` · Plánovaný odchod: ${format(new Date(row.plannedEnd), "d.M.yyyy")}`
            : null}
          {row.actualEnd
            ? ` · Skutečný odchod: ${format(new Date(row.actualEnd), "d.M.yyyy")}`
            : null}
        </p>
      )}

      {/* Success Modal */}
      <SuccessModal
        open={successModal.open}
        onOpenChange={(open) => setSuccessModal((prev) => ({ ...prev, open }))}
        title={successModal.title}
        message={successModal.message}
      />

      {/* Error Modal */}
      <ErrorModal
        open={errorModal.open}
        onOpenChange={(open) => setErrorModal((prev) => ({ ...prev, open }))}
        title={errorModal.title}
        message={errorModal.message}
      />
    </div>
  )
}
