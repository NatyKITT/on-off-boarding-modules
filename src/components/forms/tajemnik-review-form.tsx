"use client"

import * as React from "react"
import { useState } from "react"
import { Check, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"

export type TajemnikReviewSummary = {
  workResults: string
  workBehavior: string
  socialSkills: string
  skillsKnowledgeTraits: string
  recommendation: "yes" | "no" | ""
  reason: string
  evaluatorName: string | null
  evaluatorEmail: string | null
}

export type TajemnikReviewSubmitValues = {
  tajemnikAgreement: "yes" | "no"
  tajemnikComment: string
  tajemnikSignature: {
    signedByName: string | null
    signedByEmail: string | null
    signedAt: string | null
  }
}

type Props = {
  summary: TajemnikReviewSummary
  canSubmit: boolean
  currentUserName: string
  currentUserEmail: string
  onSubmit: (values: TajemnikReviewSubmitValues) => void | Promise<void>
}

function fmtDateTime(value?: string | null) {
  if (!value) return ""

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function SummaryBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="mt-1 whitespace-pre-wrap text-sm">{text || "—"}</div>
    </div>
  )
}

export function TajemnikReviewForm({
  summary,
  canSubmit,
  currentUserName,
  currentUserEmail,
  onSubmit,
}: Props) {
  const [agreement, setAgreement] = useState<"yes" | "no" | "">("")
  const [comment, setComment] = useState("")
  const [signedAt, setSignedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const isSigned = Boolean(signedAt)

  function sign() {
    if (!canSubmit) return
    setSignedAt(new Date().toISOString())
    setError(null)
  }

  function revoke() {
    setSignedAt(null)
  }

  async function handleSubmit() {
    if (!canSubmit) return

    if (agreement !== "yes" && agreement !== "no") {
      setError("Vyberte, zda s doporučením souhlasíte.")
      return
    }

    if (!signedAt) {
      setError("Před odesláním je potřeba se podepsat.")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit({
        tajemnikAgreement: agreement,
        tajemnikComment: comment.trim(),
        tajemnikSignature: {
          signedByName: currentUserName || currentUserEmail || null,
          signedByEmail: currentUserEmail || null,
          signedAt,
        },
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const recommendationLabel =
    summary.recommendation === "yes"
      ? "ANO – doporučuje pokračování pracovního poměru"
      : summary.recommendation === "no"
        ? "NE – nedoporučuje pokračování pracovního poměru"
        : "Bez stanoviska"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vyjádření k vyhodnocení zkušební doby</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="text-xs text-muted-foreground">
          Hodnotitel: {summary.evaluatorName || "—"}
          {summary.evaluatorEmail ? ` (${summary.evaluatorEmail})` : ""}
        </div>

        <SummaryBlock title="Pracovní výsledky" text={summary.workResults} />
        <SummaryBlock title="Pracovní chování" text={summary.workBehavior} />
        <SummaryBlock
          title="Sociální chování a spolupráce"
          text={summary.socialSkills}
        />
        <SummaryBlock
          title="Dovednosti, znalosti a vlastnosti"
          text={summary.skillsKnowledgeTraits}
        />

        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Doporučení k pokračování pracovního poměru
          </div>
          <div className="mt-1 text-sm font-medium">{recommendationLabel}</div>
          {summary.recommendation === "no" && summary.reason && (
            <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
              Důvod: {summary.reason}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <Label className="mb-2 block text-sm font-medium">
            S výše uvedeným doporučením
          </Label>
          <RadioGroup
            value={agreement}
            onValueChange={(value) => setAgreement(value as "yes" | "no")}
            className="flex flex-col gap-2"
            disabled={!canSubmit || isSubmitting}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="yes" id="tajemnik-agree-yes" />
              <Label htmlFor="tajemnik-agree-yes" className="font-normal">
                Souhlasím
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="no" id="tajemnik-agree-no" />
              <Label htmlFor="tajemnik-agree-no" className="font-normal">
                Nesouhlasím
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label
            htmlFor="tajemnik-comment"
            className="mb-2 block text-sm font-medium"
          >
            Komentář (nepovinné)
          </Label>
          <Textarea
            id="tajemnik-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            disabled={!canSubmit || isSubmitting}
            placeholder="Volitelný komentář k vyjádření..."
            className="resize-y"
          />
        </div>

        <div className="flex flex-col rounded-md border p-3">
          <Label className="mb-2 text-sm font-medium">Podpis a potvrzení</Label>

          <div className="min-h-[52px] flex-1">
            {isSigned ? (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <div className="font-medium">
                  {currentUserName || currentUserEmail}
                </div>
                <div className="text-xs text-muted-foreground">
                  {fmtDateTime(signedAt)}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                Nepodepsáno
              </div>
            )}
          </div>

          {canSubmit && (
            <div className="mt-3 flex flex-wrap gap-2">
              {!isSigned ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={sign}
                  disabled={isSubmitting}
                >
                  <Check className="size-3 shrink-0" />
                  Podepsat
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-muted-foreground"
                  onClick={revoke}
                  disabled={isSubmitting}
                >
                  <Undo2 className="size-3 shrink-0" />
                  Zrušit podpis
                </Button>
              )}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {!canSubmit && (
          <p className="text-sm text-muted-foreground">
            Tento krok může dokončit pouze tajemník úřadu.
          </p>
        )}

        {canSubmit && (
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleSubmit()}
            className="h-auto min-h-10 whitespace-normal bg-[#00847C] px-4 py-2.5 text-sm leading-snug text-white hover:bg-[#0B6D73]"
          >
            {isSubmitting ? "Odesílám…" : "Odeslat vyjádření"}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
