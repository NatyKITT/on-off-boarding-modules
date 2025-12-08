"use client"

import { useCallback } from "react"

import type { Position } from "@/types/position"

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
  onSuccess?: (newId?: number) => void
  personalNumberMeta?: PersonalNumberMeta
}

export function OnboardingFormClient(props: Props) {
  const validatePersonalNumber = useCallback(
    async (personalNumber: string): Promise<PersonalNumberCheckResult> => {
      const trimmed = personalNumber.trim()

      if (!trimmed) {
        return { ok: true }
      }

      const res = await fetch(
        `/api/osobni-cislo/check?number=${encodeURIComponent(trimmed)}`
      )

      if (!res.ok) {
        throw new Error("Nepodařilo se ověřit osobní číslo v EOS.")
      }

      return (await res.json()) as PersonalNumberCheckResult
    },
    []
  )

  return (
    <OnboardingFormUnified
      {...props}
      validatePersonalNumber={validatePersonalNumber}
    />
  )
}
