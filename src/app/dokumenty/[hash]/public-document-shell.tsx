"use client"

import { useState } from "react"
import type { EmploymentDocumentType } from "@prisma/client"
import { CheckCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { PublicDocumentForm } from "./public-document-form"

type Props = {
  documentId: number
  hash: string
  type: EmploymentDocumentType
}

export function PublicDocumentShell({ documentId, hash, type }: Props) {
  const [submitted, setSubmitted] = useState(false)

  return (
    <>
      <div aria-hidden={submitted}>
        <PublicDocumentForm
          documentId={documentId}
          hash={hash}
          type={type}
          onSubmitted={() => setSubmitted(true)}
        />
      </div>

      <Dialog open={submitted} onOpenChange={() => {}}>
        <DialogContent className="max-h-[90vh] w-full max-w-md overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/20">
                <CheckCircle className="size-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <DialogTitle>Děkujeme za vyplnění</DialogTitle>
                <DialogDescription>
                  Vaše údaje byly úspěšně uloženy. Personální oddělení bude o
                  vyplnění informováno a v případě potřeby vás bude kontaktovat
                  s dalším postupem.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              Formulář není potřeba vyplňovat znovu. Tuto stránku můžete nyní
              bezpečně zavřít.
            </p>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={() => {
                try {
                  window.close()
                } catch {}
              }}
            >
              Zavřít okno
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
