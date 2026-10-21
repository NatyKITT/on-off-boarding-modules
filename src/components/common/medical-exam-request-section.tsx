"use client"

import * as React from "react"
import { useCallback, useEffect, useState } from "react"

import { useToast } from "@/hooks/use-toast"
import { MEDICAL_EXAM_TYPE_OPTIONS } from "@/lib/medical-exam-request-shared"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { SavingButtonLabel } from "@/components/common/saving-button-label"

type MedicalExamVariant = "ULZ" | "OWN_DOCTOR"

type MedicalExamRequestData = {
  positionNameSuggestion: string | null
  medicalExamJobTitle: string | null
  medicalExamJobDescription: string | null
  medicalExamWorkRegime: string | null
  medicalExamRiskFactors: string | null
  medicalExamWorkCategory: string | null
  medicalExamProfessionalRisk: string | null
  medicalExamType: string | null
  medicalExamExamReason: string | null
  medicalExamVariant: MedicalExamVariant | null
  medicalExamAppointmentAt: string | null
  medicalExamSelfArranged: boolean
  medicalExamBirthDate: string | null
  medicalExamAddress: string | null
  medicalExamRequestGeneratedAt: string | null
  medicalExamRequestSentAt: string | null
  medicalExamRequestSentBy: string | null
  personalQuestionnaireCompletedAt: string | null
  questionnaireBirthDate: string | null
  questionnaireAddress: string | null
  medicalExamSignedFile: {
    fileName: string
    uploadedAt: string
    uploadedBy: string | null
  } | null
}

type MedicalExamRequestSectionProps = {
  active: boolean
  onboardingId: number
  onDirtyChange?: (dirty: boolean) => void
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toDateInputValue(value: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function MedicalExamRequestSection({
  active,
  onboardingId,
  onDirtyChange,
}: MedicalExamRequestSectionProps) {
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<MedicalExamRequestData | null>(null)
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [workRegime, setWorkRegime] = useState("")
  const [hasRiskFactors, setHasRiskFactors] = useState(false)
  const [riskFactors, setRiskFactors] = useState("")
  const [workCategory, setWorkCategory] = useState<string | null>(null)
  const [hasProfessionalRisk, setHasProfessionalRisk] = useState(false)
  const [professionalRisk, setProfessionalRisk] = useState("")
  const [examType, setExamType] = useState<string | null>(null)
  const [examReason, setExamReason] = useState("")
  const [variant, setVariant] = useState<MedicalExamVariant | null>(null)
  const [appointmentAt, setAppointmentAt] = useState("")
  const [selfArranged, setSelfArranged] = useState(false)
  const [manualBirthDate, setManualBirthDate] = useState("")
  const [manualAddress, setManualAddress] = useState("")
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/medical-exam-request`,
        {
          credentials: "include",
        }
      )
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Nepodařilo se načíst údaje.")
      }

      const loaded = json.data as MedicalExamRequestData
      setData(loaded)
      setJobTitle(
        loaded.medicalExamJobTitle ?? loaded.positionNameSuggestion ?? ""
      )
      setJobDescription(loaded.medicalExamJobDescription ?? "")
      setWorkRegime(loaded.medicalExamWorkRegime ?? "")
      setHasRiskFactors(Boolean(loaded.medicalExamRiskFactors))
      setRiskFactors(loaded.medicalExamRiskFactors ?? "")
      setWorkCategory(loaded.medicalExamWorkCategory)
      setHasProfessionalRisk(Boolean(loaded.medicalExamProfessionalRisk))
      setProfessionalRisk(loaded.medicalExamProfessionalRisk ?? "")
      setExamType(loaded.medicalExamType ?? MEDICAL_EXAM_TYPE_OPTIONS[0])
      setExamReason(loaded.medicalExamExamReason ?? "")
      setVariant(loaded.medicalExamVariant)
      setAppointmentAt(toDateTimeLocalValue(loaded.medicalExamAppointmentAt))
      setSelfArranged(loaded.medicalExamSelfArranged)
      setManualBirthDate(toDateInputValue(loaded.medicalExamBirthDate))
      setManualAddress(loaded.medicalExamAddress ?? "")
    } catch (err) {
      toast({
        title: "Chyba při načítání",
        description:
          err instanceof Error ? err.message : "Nepodařilo se načíst údaje.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [onboardingId, toast])

  useEffect(() => {
    if (active) void load()
  }, [active, load])

  const dirty = Boolean(
    data &&
      (jobTitle !==
        (data.medicalExamJobTitle ?? data.positionNameSuggestion ?? "") ||
        jobDescription !== (data.medicalExamJobDescription ?? "") ||
        workRegime !== (data.medicalExamWorkRegime ?? "") ||
        riskFactors !== (data.medicalExamRiskFactors ?? "") ||
        workCategory !== data.medicalExamWorkCategory ||
        professionalRisk !== (data.medicalExamProfessionalRisk ?? "") ||
        examType !== (data.medicalExamType ?? MEDICAL_EXAM_TYPE_OPTIONS[0]) ||
        examReason !== (data.medicalExamExamReason ?? "") ||
        variant !== data.medicalExamVariant ||
        appointmentAt !== toDateTimeLocalValue(data.medicalExamAppointmentAt) ||
        selfArranged !== data.medicalExamSelfArranged ||
        manualBirthDate !== toDateInputValue(data.medicalExamBirthDate) ||
        manualAddress !== (data.medicalExamAddress ?? ""))
  )

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const isVstupni = examType === MEDICAL_EXAM_TYPE_OPTIONS[0]

  async function handleSave() {
    setSaving(true)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/medical-exam-request`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            medicalExamJobTitle: jobTitle || null,
            medicalExamJobDescription: jobDescription || null,
            medicalExamWorkRegime: workRegime || null,
            medicalExamRiskFactors: hasRiskFactors ? riskFactors || null : null,
            medicalExamWorkCategory: workCategory,
            medicalExamProfessionalRisk: hasProfessionalRisk
              ? professionalRisk || null
              : null,
            medicalExamType: examType,
            medicalExamExamReason: isVstupni ? examReason || null : examReason,
            medicalExamVariant: variant,
            medicalExamAppointmentAt:
              appointmentAt && !selfArranged
                ? new Date(appointmentAt).toISOString()
                : null,
            medicalExamSelfArranged: selfArranged,
            medicalExamBirthDate: manualBirthDate
              ? new Date(manualBirthDate).toISOString()
              : null,
            medicalExamAddress: manualAddress || null,
          }),
        }
      )
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Uložení se nezdařilo.")
      }

      toast({ title: "Uloženo", description: "Údaje byly uloženy." })
      await load()
    } catch (err) {
      toast({
        title: "Chyba při ukládání",
        description:
          err instanceof Error ? err.message : "Uložení se nezdařilo.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)

    try {
      const res = await fetch(
        `/api/nastupy/${onboardingId}/medical-exam-request/generate`,
        { method: "POST", credentials: "include" }
      )

      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error(json?.message ?? "Žádost se nepodařilo vygenerovat.")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")

      toast({
        title: "Žádost vygenerována",
        description:
          "Zkontrolujte si náhled, vytiskněte, podepište a naskenovanou verzi nahrajte níže.",
      })
      await load()
    } catch (err) {
      toast({
        title: "Chyba při generování",
        description:
          err instanceof Error
            ? err.message
            : "Žádost se nepodařilo vygenerovat.",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  async function handleUploadSigned(file: File) {
    setUploading(true)

    try {
      const body = new FormData()
      body.append("file", file)

      const res = await fetch(
        `/api/nastupy/${onboardingId}/medical-exam-request/upload-signed`,
        { method: "POST", credentials: "include", body }
      )
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        throw new Error(json?.message ?? "Nahrání se nezdařilo.")
      }

      toast({
        title: "Nahráno",
        description: "Podepsaná žádost byla nahrána.",
      })
      await load()
    } catch (err) {
      toast({
        title: "Chyba při nahrávání",
        description:
          err instanceof Error ? err.message : "Nahrání se nezdařilo.",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const questionnaireCompleted = Boolean(data?.personalQuestionnaireCompletedAt)
  const birthDateFromQuestionnaire = data?.questionnaireBirthDate ?? null
  const addressFromQuestionnaire = data?.questionnaireAddress ?? null
  const hasBirthDate = Boolean(birthDateFromQuestionnaire || manualBirthDate)
  const hasAddress = Boolean(addressFromQuestionnaire || manualAddress)
  const requiredFieldsFilled = Boolean(
    jobTitle &&
      jobDescription &&
      workCategory &&
      examType &&
      variant &&
      (isVstupni || examReason)
  )

  const generateBlockedReason =
    !hasBirthDate || !hasAddress
      ? "Nejdřív doplňte datum narození a adresu trvalého pobytu (buď ručně níže, nebo počkejte, až zaměstnanec vyplní osobní dotazník)."
      : !requiredFieldsFilled
        ? "Nejdřív vyplňte pracovní zařazení, druh práce, kategorii práce, druh prohlídky (a u jiné než vstupní i důvod) a variantu vstupní prohlídky."
        : undefined

  if (!active) return null

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-md border bg-muted/40 p-3 text-sm">
        <div className="font-medium">Žádost o pracovnělékařskou prohlídku</div>

        <div className="space-y-2 rounded-md border bg-background px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {questionnaireCompleted
              ? "Doplněno z osobního dotazníku zaměstnance."
              : "Zaměstnanec ještě nevyplnil osobní dotazník – doplňte prosím ručně. Jakmile dotazník vyplní, appka přednostně použije jeho údaje."}
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="medical-exam-birth-date">Datum narození</Label>
              <Input
                id="medical-exam-birth-date"
                type="date"
                value={birthDateFromQuestionnaire ?? manualBirthDate}
                onChange={(e) => setManualBirthDate(e.target.value)}
                disabled={loading || Boolean(birthDateFromQuestionnaire)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="medical-exam-address">
                Adresa trvalého pobytu
              </Label>
              <Input
                id="medical-exam-address"
                value={addressFromQuestionnaire ?? manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                placeholder="Ulice č.p., PSČ Město"
                disabled={loading || Boolean(addressFromQuestionnaire)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="medical-exam-job-title">
            Pracovní zařazení (nynější/navrhované)
          </Label>
          <Input
            id="medical-exam-job-title"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Předvyplněno podle pozice u nástupu – zkontrolujte, zda souhlasí.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="medical-exam-job-description">
            Druh práce (stručný popis pracovní činnosti)
          </Label>
          <Textarea
            id="medical-exam-job-description"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            disabled={loading}
            rows={3}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="medical-exam-work-regime">Režim práce</Label>
            <Input
              id="medical-exam-work-regime"
              value={workRegime}
              onChange={(e) => setWorkRegime(e.target.value)}
              placeholder="např. Jednosměnný"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Kategorie práce</Label>
            <Select
              value={workCategory ?? undefined}
              onValueChange={(value) => setWorkCategory(value)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vyberte kategorii" />
              </SelectTrigger>
              <SelectContent>
                {["1", "2", "2R", "3", "4"].map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Rizikové faktory pracovních podmínek</Label>
          <RadioGroup
            value={hasRiskFactors ? "yes" : "no"}
            onValueChange={(value) => setHasRiskFactors(value === "yes")}
            className="flex gap-4"
            disabled={loading}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="risk-no" value="no" />
              <Label htmlFor="risk-no">Ne</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="risk-yes" value="yes" />
              <Label htmlFor="risk-yes">Ano</Label>
            </div>
          </RadioGroup>
          {hasRiskFactors && (
            <Textarea
              value={riskFactors}
              onChange={(e) => setRiskFactors(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder="Popište rizikové faktory"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Profesní riziko</Label>
          <RadioGroup
            value={hasProfessionalRisk ? "yes" : "no"}
            onValueChange={(value) => setHasProfessionalRisk(value === "yes")}
            className="flex gap-4"
            disabled={loading}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="prof-risk-no" value="no" />
              <Label htmlFor="prof-risk-no">Ne</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="prof-risk-yes" value="yes" />
              <Label htmlFor="prof-risk-yes">Ano</Label>
            </div>
          </RadioGroup>
          {hasProfessionalRisk && (
            <Textarea
              value={professionalRisk}
              onChange={(e) => setProfessionalRisk(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder="Popište profesní riziko"
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Druh prohlídky</Label>
          <Select
            value={examType ?? undefined}
            onValueChange={(value) => setExamType(value)}
            disabled={loading}
          >
            <SelectTrigger>
              <SelectValue placeholder="Vyberte druh prohlídky" />
            </SelectTrigger>
            <SelectContent>
              {MEDICAL_EXAM_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isVstupni && (
          <div className="space-y-1.5">
            <Label htmlFor="medical-exam-exam-reason">
              Důvod k provedení {examType} prohlídky
            </Label>
            <Textarea
              id="medical-exam-exam-reason"
              value={examReason}
              onChange={(e) => setExamReason(e.target.value)}
              disabled={loading}
              rows={2}
            />
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Varianta vstupní prohlídky</Label>
            <Select
              value={variant ?? undefined}
              onValueChange={(value) => setVariant(value as MedicalExamVariant)}
              disabled={loading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Vyberte variantu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ULZ">ÚLZ (partnerský ústav)</SelectItem>
                <SelectItem value="OWN_DOCTOR">
                  Vlastní praktický lékař
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {variant === "ULZ" && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Termín u ÚLZ</Label>
              <RadioGroup
                value={selfArranged ? "self" : "specific"}
                onValueChange={(value) => setSelfArranged(value === "self")}
                className="flex flex-wrap gap-4"
                disabled={loading}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="appointment-specific" value="specific" />
                  <Label htmlFor="appointment-specific">
                    Zadat konkrétní termín
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="appointment-self" value="self" />
                  <Label htmlFor="appointment-self">
                    Domluví se zaměstnanec sám
                  </Label>
                </div>
              </RadioGroup>

              {!selfArranged && (
                <Input
                  id="medical-exam-appointment"
                  type="datetime-local"
                  value={appointmentAt}
                  onChange={(e) => setAppointmentAt(e.target.value)}
                  disabled={loading}
                />
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSave()}
            disabled={loading || saving}
          >
            <SavingButtonLabel
              saving={saving}
              savingText="Ukládám…"
              idleText="Uložit údaje"
            />
          </Button>

          <Button
            size="sm"
            onClick={() => void handleGenerate()}
            disabled={loading || generating || Boolean(generateBlockedReason)}
            title={generateBlockedReason}
          >
            <SavingButtonLabel
              saving={generating}
              savingText="Generuji…"
              idleText="Vygenerovat žádost"
            />
          </Button>
        </div>

        {data?.medicalExamRequestGeneratedAt && (
          <p className="text-xs text-muted-foreground">
            Naposledy vygenerováno{" "}
            {new Date(data.medicalExamRequestGeneratedAt).toLocaleString(
              "cs-CZ"
            )}
            .
          </p>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <Label>Podepsaná a orazítkovaná žádost</Label>
          <p className="text-xs text-muted-foreground">
            Vygenerovanou žádost vytiskněte, dejte podepsat a orazítkovat,
            naskenujte a výsledné PDF nahrajte zde – teprve pak ji půjde v okně
            „Nástupní dokumenty“ přiložit a odeslat zaměstnanci.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUploadSigned(file)
            }}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || uploading}
          >
            <SavingButtonLabel
              saving={uploading}
              savingText="Nahrávám…"
              idleText="Nahrát podepsanou žádost (PDF)"
            />
          </Button>

          {data?.medicalExamSignedFile ? (
            <p className="text-xs text-emerald-600">
              Nahráno: {data.medicalExamSignedFile.fileName} –{" "}
              {new Date(data.medicalExamSignedFile.uploadedAt).toLocaleString(
                "cs-CZ"
              )}
              {data.medicalExamSignedFile.uploadedBy
                ? ` (${data.medicalExamSignedFile.uploadedBy})`
                : ""}
              {" · "}
              <a
                href={`/api/nastupy/${onboardingId}/medical-exam-request/signed-file`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                zobrazit
              </a>
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              Podepsaná žádost ještě nebyla nahrána.
            </p>
          )}
        </div>

        {data?.medicalExamRequestSentAt && (
          <p className="text-xs text-emerald-600">
            Zaměstnanci odesláno{" "}
            {new Date(data.medicalExamRequestSentAt).toLocaleString("cs-CZ")}
            {data.medicalExamRequestSentBy
              ? ` (${data.medicalExamRequestSentBy})`
              : ""}
            .
          </p>
        )}
        {!data?.medicalExamRequestSentAt && (
          <p className="text-xs text-muted-foreground">
            Odeslání zaměstnanci se řeší v okně „Nástupní dokumenty“ –
            zaškrtnutím volby „Přiložit i žádost o pracovnělékařskou prohlídku“.
          </p>
        )}
      </div>
    </section>
  )
}
