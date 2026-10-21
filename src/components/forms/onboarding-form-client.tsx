"use client"

import { useCallback } from "react"

import type { Position } from "@/types/position"

import type { ManagerNotifyPrompt } from "@/components/common/manager-notify-dialog"

import {
  OnboardingFormUnified,
  type FormValues,
  type PersonalNumberCheckResult,
  type PersonalNumberMeta,
} from "./onboarding-form"

type Props = {
  positions: Position[]
  id?: number
  initial?: Partial<FormValues>
  mode?: "create-planned" | "create-actual" | "edit"
  defaultCreateMode?: "create-planned" | "create-actual" | "edit"
  prefillDate?: string
  editContext?: "planned" | "actual"
  onSuccess?: (
    newId?: number,
    managerNotifyPrompt?: ManagerNotifyPrompt
  ) => void
  personalNumberMeta?: PersonalNumberMeta
  onDirtyChange?: (dirty: boolean) => void
}

export function OnboardingFormClient(props: Props) {
  const validatePersonalNumber = useCallback(
    async (personalNumber: string): Promise<PersonalNumberCheckResult> => {
      const trimmed = personalNumber.trim()

      if (!trimmed) {
        return { ok: true }
      }

      const url = new URL("/api/osobni-cislo/check", window.location.origin)
      url.searchParams.set("number", trimmed)

      if (props.id) {
        url.searchParams.set("excludeOnboardingId", String(props.id))
      }

      const res = await fetch(url.toString(), {
        cache: "no-store",
      })

      if (!res.ok) {
        throw new Error("Nepodařilo se ověřit osobní číslo v EOS.")
      }

      return (await res.json()) as PersonalNumberCheckResult
    },
    [props.id]
  )

  return (
    <OnboardingFormUnified
      {...props}
      validatePersonalNumber={validatePersonalNumber}
    />
  )
}
