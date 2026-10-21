"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SavingButtonLabel } from "@/components/common/saving-button-label"

type UnsavedChangesDialogProps = {
  open: boolean
  onStay: () => void
  onDiscard: () => void
  onSaveAndLeave?: () => void
  saving?: boolean
  description?: string
  saveLabel?: string
  savingLabel?: string
}

export function UnsavedChangesDialog({
  open,
  onStay,
  onDiscard,
  onSaveAndLeave,
  saving = false,
  description = "Máte rozepsané změny, které nejsou uložené. Co chcete udělat?",
  saveLabel = "Uložit a odejít",
  savingLabel = "Ukládám…",
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Neuložené změny</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>Zůstat</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onDiscard}
          >
            Odejít bez uložení
          </AlertDialogAction>
          {onSaveAndLeave && (
            <AlertDialogAction
              className="bg-[#00847C] text-white hover:bg-[#0B6D73]"
              onClick={onSaveAndLeave}
              disabled={saving}
            >
              <SavingButtonLabel
                saving={saving}
                savingText={savingLabel}
                idleText={saveLabel}
              />
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
