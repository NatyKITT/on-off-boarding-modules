import { z } from "zod"

import {
  CZECH_CITIZENSHIP_VALUE,
  OTHER_CITIZENSHIP_VALUE,
} from "@/types/nationality-options"
import { DEFAULT_PHONE_COUNTRY_CODE } from "@/types/phone-country-codes"

const normalizeString = (v: unknown) => (typeof v === "string" ? v.trim() : v)

const optionalTrimmedString = z
  .preprocess(normalizeString, z.string().trim().optional())
  .transform((v) => (typeof v === "string" && v.trim() === "" ? undefined : v))

const requiredTrimmedString = (message: string) =>
  z.preprocess(
    normalizeString,
    z
      .string({
        required_error: message,
        invalid_type_error: message,
      })
      .trim()
      .min(1, message)
  )

const requiredBoolean = (message: string) =>
  z.boolean({
    required_error: message,
    invalid_type_error: message,
  })

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const CZ_DATE_REGEX = /^\d{2}\.\d{2}\.\d{4}$/

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function toIsoDate(value: string): string | null {
  const v = value.trim()

  let y: number, m: number, d: number

  if (ISO_DATE_REGEX.test(v)) {
    const [yy, mm, dd] = v.split("-")
    y = Number(yy)
    m = Number(mm)
    d = Number(dd)
  } else if (CZ_DATE_REGEX.test(v)) {
    const [dd, mm, yy] = v.split(".")
    y = Number(yy)
    m = Number(mm)
    d = Number(dd)
  } else {
    return null
  }

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d))
    return null
  if (y < 1900 || y > 2100) return null
  if (m < 1 || m > 12) return null
  if (d < 1 || d > 31) return null

  const date = new Date(Date.UTC(y, m - 1, d))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null
  }

  return `${y}-${pad2(m)}-${pad2(d)}`
}

function isoDateToEpoch(iso: string): number | null {
  if (!ISO_DATE_REGEX.test(iso)) return null
  const [yy, mm, dd] = iso.split("-")
  const y = Number(yy)
  const m = Number(mm)
  const d = Number(dd)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null
  }
  return date.getTime()
}

const dateString = z
  .preprocess(
    normalizeString,
    z
      .string({
        required_error: "Datum je povinné.",
        invalid_type_error: "Datum je povinné.",
      })
      .trim()
  )
  .transform((v, ctx) => {
    const iso = toIsoDate(v)
    if (!iso) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Zadejte platné datum.",
      })
      return z.NEVER
    }
    return iso
  })

const optionalDateString = z
  .preprocess(normalizeString, z.string().trim().optional())
  .transform((v, ctx) => {
    if (v == null) return undefined
    if (typeof v === "string" && v.trim() === "") return undefined

    const iso = toIsoDate(String(v))
    if (!iso) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Zadejte platné datum.",
      })
      return z.NEVER
    }
    return iso
  })

const refineDateRange = (
  val: { from?: string; to?: string },
  ctx: z.RefinementCtx,
  fromPath: (string | number)[] = ["from"],
  toPath: (string | number)[] = ["to"]
) => {
  if (!val.from || !val.to) return

  const fromEpoch = isoDateToEpoch(val.from)
  const toEpoch = isoDateToEpoch(val.to)
  if (fromEpoch === null || toEpoch === null) return

  if (fromEpoch > toEpoch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: fromPath,
      message: "Datum „Od“ nemůže být později než datum „Do“.",
    })

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: toPath,
      message: "Datum „Do“ nemůže být dříve než datum „Od“.",
    })
  }
}

export const experienceTypeEnum = z.enum([
  "EMPLOYMENT",
  "OSVC",
  "DPP",
  "DPC",
  "OTHER",
])

export const workloadTypeEnum = z.enum(["FULL", "HALF", "OTHER"])

const experienceEntrySchema = z
  .object({
    employer: optionalTrimmedString,
    jobPositionName: optionalTrimmedString,
    jobType: optionalTrimmedString,
    employmentType: experienceTypeEnum.optional(),
    employmentTypeOther: optionalTrimmedString,
    from: optionalDateString,
    to: optionalDateString,
    workloadType: workloadTypeEnum.optional(),
    workloadOther: optionalTrimmedString,
  })
  .superRefine((val, ctx) => {
    const any =
      !!val.employer ||
      !!val.jobPositionName ||
      !!val.jobType ||
      !!val.employmentType ||
      !!val.from ||
      !!val.to ||
      !!val.workloadType
    if (!any) return

    if (!val.employer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employer"],
        message: "Uveďte zaměstnavatele.",
      })
    }
    if (!val.jobPositionName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobPositionName"],
        message: "Uveďte název pracovní pozice.",
      })
    }
    if (!val.jobType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobType"],
        message: "Uveďte popis pracovní činnosti.",
      })
    }
    if (!val.employmentType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employmentType"],
        message: "Vyberte typ výkonu práce (zaměstnání, OSVČ, DPP, DPČ, jiné).",
      })
    }
    if (val.employmentType === "OTHER" && !val.employmentTypeOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employmentTypeOther"],
        message: "Uveďte typ výkonu práce.",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum „Od“.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum „Do“.",
      })
    }
    if (!val.workloadType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workloadType"],
        message: "Vyberte rozsah pracovního úvazku.",
      })
    }
    if (val.workloadType === "OTHER" && !val.workloadOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workloadOther"],
        message: "Uveďte rozsah pracovního úvazku.",
      })
    }

    refineDateRange({ from: val.from, to: val.to }, ctx, ["from"], ["to"])
  })

const militaryEntrySchema = z
  .object({
    service: z.enum(["BASIC", "ALTERNATIVE", "CIVIL"]).optional(),
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any = !!val.service || !!val.from || !!val.to
    if (!any) return

    if (!val.service) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["service"],
        message: "Vyberte druh služby.",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum „Od“.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum „Do“.",
      })
    }

    refineDateRange(val, ctx)
  })

const childCareSchema = z
  .object({
    childName: optionalTrimmedString,
    childBirthDate: optionalDateString,
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any =
      !!val.childName || !!val.childBirthDate || !!val.from || !!val.to
    if (!any) return

    if (!val.childName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childName"],
        message: "Uveďte jméno a příjmení dítěte.",
      })
    }
    if (!val.childBirthDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childBirthDate"],
        message: "Uveďte datum narození dítěte.",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum „Od“.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum „Do“.",
      })
    }

    refineDateRange(val, ctx)
  })

const closeRelativeCareSchema = z
  .object({
    personName: optionalTrimmedString,
    dependencyLevel: z.enum(["III", "IV"]).optional(),
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any =
      !!val.personName || !!val.dependencyLevel || !!val.from || !!val.to
    if (!any) return

    if (!val.personName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["personName"],
        message: "Uveďte jméno a příjmení osoby.",
      })
    }
    if (!val.dependencyLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dependencyLevel"],
        message: "Vyberte stupeň závislosti (III nebo IV).",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum „Od“.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum „Do“.",
      })
    }

    refineDateRange(val, ctx)
  })

const doctoralStudySchema = z
  .object({
    schoolName: optionalTrimmedString,
    studyProgram: optionalTrimmedString,
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any = !!val.schoolName || !!val.studyProgram || !!val.from || !!val.to
    if (!any) return

    if (!val.schoolName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schoolName"],
        message: "Uveďte název vysoké školy.",
      })
    }
    if (!val.studyProgram) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studyProgram"],
        message: "Uveďte studijní program.",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum „Od“.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum „Do“.",
      })
    }

    refineDateRange(val, ctx)
  })

const unpaidLeaveEntrySchema = z
  .object({
    reason: optionalTrimmedString,
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any = !!val.reason || !!val.from || !!val.to
    if (any) {
      if (!val.reason) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["reason"],
          message: "Uveďte důvod neplaceného volna.",
        })
      }
      if (!val.from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["from"],
          message: "Uveďte datum „Od“.",
        })
      }
      if (!val.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: "Uveďte datum „Do“.",
        })
      }
    }

    refineDateRange(val, ctx)
  })

export const affidavitSchema = z
  .object({
    noExperience: z.boolean().default(false),

    experience: z.array(experienceEntrySchema).default([]),

    hasMilitaryService: requiredBoolean(
      "Vyberte prosím Ano/Ne (vojenská nebo civilní služba)."
    ),
    militaryService: z.array(militaryEntrySchema).default([]),

    hasUnpaidLeave: requiredBoolean(
      "Vyberte prosím Ano/Ne (pracovní volno bez náhrady platu)."
    ),
    unpaidLeave: z.array(unpaidLeaveEntrySchema).default([]),

    hasMaternityParental: requiredBoolean(
      "Vyberte prosím Ano/Ne (mateřská nebo rodičovská dovolená)."
    ),
    maternityParental: z.array(childCareSchema).default([]),

    hasContinuousCare: requiredBoolean(
      "Vyberte prosím Ano/Ne (trvalá péče o dítě)."
    ),
    continuousCare: z.array(childCareSchema).default([]),

    hasDisabledChildCare: requiredBoolean(
      "Vyberte prosím Ano/Ne (péče o zdravotně postižené dítě)."
    ),
    disabledChildCare: z.array(childCareSchema).default([]),

    hasCloseRelativeCare: requiredBoolean(
      "Vyberte prosím Ano/Ne (péče o osobu blízkou)."
    ),
    closeRelativeCare: z.array(closeRelativeCareSchema).default([]),

    hasDoctoralStudy: requiredBoolean(
      "Vyberte prosím Ano/Ne (doktorské studium)."
    ),
    doctoralStudy: z.array(doctoralStudySchema).default([]),

    isTruthful: requiredBoolean("Potvrďte prosím pravdivost údajů.").refine(
      (val) => val,
      "Pro odeslání musíte potvrdit pravdivost údajů."
    ),
  })
  .superRefine((data, ctx) => {
    if (!data.noExperience) {
      const hasAnyFilled = data.experience.some(
        (e) => !!e.employer || !!e.jobPositionName || !!e.jobType || !!e.from
      )
      if (!hasAnyFilled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["experience"],
          message:
            "Vyplňte alespoň jeden záznam praxe (zaměstnavatel, název pozice, druh práce a datum Od), nebo zaškrtněte „Nemám žádnou praxi“.",
        })
      }
    }

    if (data.hasMilitaryService) {
      const any = data.militaryService.some(
        (m) => !!m.service || !!m.from || !!m.to
      )
      if (!any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["militaryService"],
          message: "Vyplňte alespoň jeden záznam, nebo zvolte „Ne“.",
        })
      }
    }

    if (data.hasUnpaidLeave) {
      const any = data.unpaidLeave.some((u) => !!u.reason || !!u.from || !!u.to)
      if (!any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["unpaidLeave"],
          message: "Vyplňte alespoň jeden záznam, nebo zvolte „Ne“.",
        })
      }
    }

    const checkChildCare = (
      list: z.infer<typeof childCareSchema>[],
      path: string
    ) => {
      const any = list.some(
        (c) => !!c.childName || !!c.childBirthDate || !!c.from || !!c.to
      )
      if (!any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [path],
          message: "Vyplňte alespoň jeden záznam, nebo zvolte „Ne“.",
        })
      }
    }

    if (data.hasMaternityParental) {
      checkChildCare(data.maternityParental, "maternityParental")
    }
    if (data.hasContinuousCare) {
      checkChildCare(data.continuousCare, "continuousCare")
    }
    if (data.hasDisabledChildCare) {
      checkChildCare(data.disabledChildCare, "disabledChildCare")
    }

    if (data.hasCloseRelativeCare) {
      const any = data.closeRelativeCare.some(
        (c) => !!c.personName || !!c.dependencyLevel || !!c.from || !!c.to
      )
      if (!any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["closeRelativeCare"],
          message: "Vyplňte alespoň jeden záznam, nebo zvolte „Ne“.",
        })
      }
    }

    if (data.hasDoctoralStudy) {
      const any = data.doctoralStudy.some(
        (d) => !!d.schoolName || !!d.studyProgram || !!d.from || !!d.to
      )
      if (!any) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["doctoralStudy"],
          message: "Vyplňte alespoň jeden záznam, nebo zvolte „Ne“.",
        })
      }
    }
  })

export type AffidavitSchema = z.infer<typeof affidavitSchema>

export const maritalStatusEnum = z.enum([
  "SINGLE",
  "MARRIED",
  "DIVORCED",
  "WIDOWED",
  "REGISTERED",
  "UNSTATED",
])

export const payrollChildSchema = z
  .object({
    childName: optionalTrimmedString,
    childBirthDate: optionalTrimmedString,
  })
  .superRefine((val, ctx) => {
    const name = (val.childName ?? "").trim()
    const date = (val.childBirthDate ?? "").trim()

    if (!name && !date) return

    if (!name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childName"],
        message: "Vyplňte prosím jméno dítěte.",
      })
    }
    if (!date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["childBirthDate"],
        message: "Vyplňte prosím datum narození dítěte.",
      })
    }
  })

export const payrollInfoSchema = z
  .object({
    firstName: requiredTrimmedString("Křestní jméno je povinné."),
    lastName: requiredTrimmedString("Příjmení je povinné."),

    birthSurnameDiffers: requiredBoolean(
      "Vyberte prosím Ano/Ne (rodné příjmení)."
    ),
    birthSurname: optionalTrimmedString,

    titleBefore: optionalTrimmedString,
    titleAfter: optionalTrimmedString,
    academicDegrees: optionalTrimmedString,

    maritalStatus: maritalStatusEnum,

    birthDate: dateString,
    birthNumber: optionalTrimmedString,
    birthPlace: requiredTrimmedString("Místo narození je povinné."),
    birthDistrict: requiredTrimmedString("Okres narození je povinný."),
    birthState: requiredTrimmedString("Stát narození je povinný."),

    citizenship: requiredTrimmedString("Státní občanství je povinné."),
    citizenshipOther: optionalTrimmedString,

    permanentStreet: requiredTrimmedString("Ulice je povinná."),
    permanentHouseNumber: requiredTrimmedString(
      "Číslo popisné / orientační je povinné."
    ),
    permanentCity: requiredTrimmedString("Obec je povinná."),
    permanentPostcode: requiredTrimmedString("PSČ je povinné."),

    hasChildren: requiredBoolean("Vyberte prosím Ano/Ne (děti)."),
    children: z.array(payrollChildSchema).default([]),

    healthInsuranceCompany: requiredTrimmedString(
      "Vyberte zdravotní pojišťovnu."
    ),
    healthInsuranceCompanyOther: optionalTrimmedString,

    bankName: requiredTrimmedString("Vyberte banku."),
    bankNameOther: optionalTrimmedString,
    bankAccountNumber: requiredTrimmedString("Číslo účtu je povinné."),

    confirmTruthfulness: requiredBoolean("Potvrďte prosím prohlášení.").refine(
      (val) => val,
      "Pro odeslání musíte potvrdit prohlášení."
    ),
    signatureDate: requiredTrimmedString("Datum odeslání je povinné."),
  })
  .superRefine((val, ctx) => {
    if (val.birthSurnameDiffers === true && !val.birthSurname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthSurname"],
        message: "Uveďte rodné příjmení.",
      })
    }

    if (val.citizenship === OTHER_CITIZENSHIP_VALUE && !val.citizenshipOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citizenshipOther"],
        message: "Vypište státní občanství.",
      })
    }

    if (
      val.healthInsuranceCompany === "OTHER" &&
      !val.healthInsuranceCompanyOther
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["healthInsuranceCompanyOther"],
        message: "Vypište název zdravotní pojišťovny.",
      })
    }

    if (val.bankName === "OTHER" && !val.bankNameOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankNameOther"],
        message: "Vypište název banky.",
      })
    }

    if (val.hasChildren) {
      const hasAny = val.children.some(
        (c) => !!c.childName || !!c.childBirthDate
      )
      if (!hasAny) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["children"],
          message: "Uveďte alespoň jedno dítě, nebo zvolte „Ne“.",
        })
      }
    }
  })

export type PayrollInfoSchema = z.infer<typeof payrollInfoSchema>

export const educationEntrySchema = z.object({
  level: z.enum(
    [
      "ZAKLADNI",
      "STREDNI_VYUCNI_LIST",
      "STREDNI",
      "STREDNI_MATURITA",
      "VYSSI_ODBORNE",
      "VYSOKOSKOLSKE",
      "BAKALAR",
      "MAGISTR",
      "DOKTORSKE",
      "PROBIHAJICI",
      "CELOZIVOTNI",
    ],
    {
      required_error: "Vyberte stupeň vzdělání.",
      invalid_type_error: "Vyberte stupeň vzdělání.",
    }
  ),
  schoolType: requiredTrimmedString("Uveďte druh školy / obor."),
  semesters: optionalTrimmedString,
  studyForm: z.enum(
    ["DENNI", "VECERNI", "DALKOVE", "DISTANCNI", "KOMBINOVANE"],
    {
      required_error: "Vyberte formu studia.",
      invalid_type_error: "Vyberte formu studia.",
    }
  ),
  graduationYear: optionalTrimmedString,
  examType: optionalTrimmedString,
  degreeTitle: requiredTrimmedString(
    "Uveďte dosažený titul, případně napište „žádný“."
  ),
  studyStatus: z.enum(["COMPLETED", "ONGOING"], {
    required_error: "Vyberte stav studia.",
    invalid_type_error: "Vyberte stav studia.",
  }),
})

export const languageLevelEnum = z.enum([
  "A0",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
])

const PRESET_LANGUAGES = ["Angličtina"] as const

const isPresetLanguage = (name?: string) => {
  const n = (name ?? "").trim().toLowerCase()
  return PRESET_LANGUAGES.some((p) => p.toLowerCase() === n)
}

const languageSchema = z
  .object({
    name: optionalTrimmedString,
    level: languageLevelEnum.optional(),
  })
  .superRefine((val, ctx) => {
    const name = (val.name ?? "").trim()
    const hasName = name.length > 0
    const hasLevel = !!val.level
    const preset = isPresetLanguage(name)

    if (!hasName && !hasLevel) return

    if (preset && !hasLevel) return

    if (!hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["name"],
        message: "Uveďte název jazyka.",
      })
    }
    if (!hasLevel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["level"],
        message: "Vyberte úroveň jazyka.",
      })
    }
  })

export const DRIVER_LICENSE_CATEGORIES = [
  "AM",
  "A1",
  "A2",
  "A",
  "B1",
  "B",
  "BE",
  "C1",
  "C1E",
  "C",
  "CE",
  "D1",
  "D1E",
  "D",
  "DE",
  "T",
] as const

export const DRIVER_LICENSE_CATEGORY_LABELS: Record<
  (typeof DRIVER_LICENSE_CATEGORIES)[number],
  string
> = {
  AM: "malý motocykl, moped",
  A1: "motocykl do 125 ccm",
  A2: "motocykl středního výkonu",
  A: "motocykl",
  B1: "čtyřkolka",
  B: "osobní automobil",
  BE: "osobní automobil s přívěsem",
  C1: "nákladní automobil do 7,5 t",
  C1E: "nákladní automobil do 7,5 t s přívěsem",
  C: "nákladní automobil",
  CE: "nákladní automobil s přívěsem",
  D1: "minibus",
  D1E: "minibus s přívěsem",
  D: "autobus",
  DE: "autobus s přívěsem",
  T: "traktor",
}

const certificateSpecialNameEntrySchema = z.object({
  name: optionalTrimmedString,
})

export const personalQuestionnaireSchema = z
  .object({
    firstName: requiredTrimmedString("Křestní jméno je povinné."),
    lastName: requiredTrimmedString("Příjmení je povinné."),

    birthSurnameDiffers: requiredBoolean(
      "Vyberte prosím Ano/Ne (rodné příjmení)."
    ),
    birthSurname: optionalTrimmedString,

    titleBefore: optionalTrimmedString,
    titleAfter: optionalTrimmedString,
    academicDegrees: optionalTrimmedString,

    maritalStatus: z.enum(
      ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "REGISTERED", "UNSTATED"],
      {
        required_error: "Vyberte rodinný stav.",
        invalid_type_error: "Vyberte rodinný stav.",
      }
    ),

    birthDate: dateString,
    birthNumber: optionalTrimmedString,
    birthPlace: requiredTrimmedString("Místo narození je povinné."),
    birthDistrict: requiredTrimmedString("Okres narození je povinný."),
    birthState: requiredTrimmedString("Stát narození je povinný."),
    birthStateOther: optionalTrimmedString,

    citizenship: requiredTrimmedString("Státní občanství je povinné."),
    citizenshipOther: optionalTrimmedString,

    foreignPermitFrom: optionalDateString,
    foreignPermitAuthority: optionalTrimmedString,
    foreignPermitTo: optionalDateString,

    dataBoxId: optionalTrimmedString,
    dataBoxDelivery: requiredBoolean(
      "Vyberte prosím Ano/Ne (datová schránka)."
    ),

    permanentStreet: requiredTrimmedString("Ulice je povinná."),
    permanentHouseNumber: requiredTrimmedString(
      "Číslo popisné / orientační je povinné."
    ),
    permanentCity: requiredTrimmedString("Obec je povinná."),
    permanentPostcode: requiredTrimmedString("PSČ je povinné."),

    useDifferentMailingAddress: requiredBoolean(
      "Vyberte prosím Ano/Ne (doručovací adresa)."
    ),
    correspondenceStreet: optionalTrimmedString,
    correspondenceHouseNumber: optionalTrimmedString,
    correspondenceCity: optionalTrimmedString,
    correspondencePostcode: optionalTrimmedString,

    email: requiredTrimmedString("E-mail je povinný.").refine(
      (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      "Zadejte platný e-mail."
    ),
    phoneCountryCode: z.string().trim().default(DEFAULT_PHONE_COUNTRY_CODE),
    phone: optionalTrimmedString,

    hasDriverLicense: requiredBoolean(
      "Vyberte prosím Ano/Ne (řidičské oprávnění)."
    ),
    driverLicenseCategories: z.array(z.string()).default([]),

    maintenanceContactName: optionalTrimmedString,
    maintenancePhoneCountryCode: z
      .string()
      .trim()
      .default(DEFAULT_PHONE_COUNTRY_CODE),
    maintenancePhone: optionalTrimmedString,

    receivesPensionBenefits: requiredBoolean("Vyberte prosím Ano/Ne (důchod)."),
    typePensionBenefits: optionalTrimmedString,

    isDisabledPerson: requiredBoolean(
      "Vyberte prosím Ano/Ne (ZTP/invalidita)."
    ),
    disabilityDegree: z.enum(["NONE", "I", "II", "III"]).default("NONE"),

    hasFamilyRelations: requiredBoolean(
      "Vyberte prosím Ano/Ne (příbuzní zaměstnaní na ÚMČ Praha 6)."
    ),
    familyRelations: optionalTrimmedString,

    languages: z.array(languageSchema).default([]),

    hasCertificateGeneral: requiredBoolean(
      "Vyberte prosím Ano/Ne (úřednická zkouška)."
    ),
    hasCertificateSpecial: requiredBoolean(
      "Vyberte prosím Ano/Ne (zvláštní odborná způsobilost)."
    ),
    certificateSpecialNames: z
      .array(certificateSpecialNameEntrySchema)
      .default([]),
    hasCertificateManagement: requiredBoolean(
      "Vyberte prosím Ano/Ne (vedoucí úředníci)."
    ),
    hasCertificateTraining: requiredBoolean(
      "Vyberte prosím Ano/Ne (vstupní školení)."
    ),

    education: z
      .array(educationEntrySchema)
      .min(1, "Uveďte alespoň jedno ukončené vzdělání.")
      .default([]),

    finalReadAndUnderstood: requiredBoolean(
      "Potvrďte prosím prohlášení o pravdivosti údajů."
    ).refine((val) => val, "Pro odeslání musíte potvrdit prohlášení."),

    finalTruthfulnessConfirm: requiredBoolean(
      "Potvrďte prosím závěrečné prohlášení."
    ).refine((val) => val, "Pro odeslání musíte potvrdit prohlášení."),
  })
  .superRefine((val, ctx) => {
    if (val.birthSurnameDiffers === true && !val.birthSurname) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthSurname"],
        message: "Uveďte rodné příjmení.",
      })
    }

    if (
      val.hasDriverLicense === true &&
      val.driverLicenseCategories.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["driverLicenseCategories"],
        message: "Vyberte alespoň jednu skupinu řidičského oprávnění.",
      })
    }

    if (
      val.hasCertificateSpecial === true &&
      !val.certificateSpecialNames.some((c) => !!c.name)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["certificateSpecialNames"],
        message: "Uveďte alespoň jeden typ osvědčení.",
      })
    }

    if (val.citizenship === OTHER_CITIZENSHIP_VALUE && !val.citizenshipOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["citizenshipOther"],
        message: "Vypište státní občanství.",
      })
    }

    if (val.birthState === OTHER_CITIZENSHIP_VALUE && !val.birthStateOther) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["birthStateOther"],
        message: "Vypište stát narození.",
      })
    }

    if (val.citizenship !== CZECH_CITIZENSHIP_VALUE) {
      if (!val.foreignPermitFrom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["foreignPermitFrom"],
          message: "Uveďte platnost povolení od.",
        })
      }
      if (!val.foreignPermitTo) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["foreignPermitTo"],
          message: "Uveďte platnost povolení do.",
        })
      }
      if (!val.foreignPermitAuthority) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["foreignPermitAuthority"],
          message: "Uveďte orgán, který povolení vydal.",
        })
      }

      refineDateRange(
        { from: val.foreignPermitFrom, to: val.foreignPermitTo },
        ctx,
        ["foreignPermitFrom"],
        ["foreignPermitTo"]
      )
    }

    if (val.dataBoxDelivery === true && !val.dataBoxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataBoxId"],
        message: "Zadejte ID datové schránky.",
      })
    }

    if (val.hasFamilyRelations === true && !val.familyRelations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["familyRelations"],
        message: "Uveďte jméno příbuzného.",
      })
    }

    if (val.useDifferentMailingAddress === true) {
      if (!val.correspondenceStreet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correspondenceStreet"],
          message: "Uveďte ulici doručovací adresy.",
        })
      }
      if (!val.correspondenceHouseNumber) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correspondenceHouseNumber"],
          message: "Uveďte číslo popisné / orientační doručovací adresy.",
        })
      }
      if (!val.correspondenceCity) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correspondenceCity"],
          message: "Uveďte obec doručovací adresy.",
        })
      }
      if (!val.correspondencePostcode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correspondencePostcode"],
          message: "Uveďte PSČ doručovací adresy.",
        })
      }
    }

    if (val.receivesPensionBenefits === true && !val.typePensionBenefits) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["typePensionBenefits"],
        message: "Uveďte typ pobíraného důchodu.",
      })
    }

    if (val.isDisabledPerson === true && val.disabilityDegree === "NONE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["disabilityDegree"],
        message: "Vyberte stupeň invalidity.",
      })
    }

    if (val.education.length > 0) {
      const lastIndex = val.education.length - 1
      const last = val.education[lastIndex]

      if (!last.semesters) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["education", lastIndex, "semesters"],
          message: "U posledního vzdělání uveďte počet tříd (semestrů).",
        })
      }
      if (!last.graduationYear) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["education", lastIndex, "graduationYear"],
          message: "U posledního vzdělání uveďte rok ukončení.",
        })
      }
      if (!last.examType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["education", lastIndex, "examType"],
          message: "U posledního vzdělání uveďte druh zkoušky.",
        })
      }
    }
  })
  .transform((val) => ({
    ...val,
    languages: val.languages.filter((lang) => !!lang.level),
  }))

export type PersonalQuestionnaireSchema = z.infer<
  typeof personalQuestionnaireSchema
>

export const experienceDocumentSchema = z
  .object({
    noExperience: z.boolean().default(false),
    experience: z.array(experienceEntrySchema).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.noExperience) return

    const hasOneComplete = val.experience.some(
      (e) => !!e.employer && !!e.jobType && !!e.from
    )

    if (!hasOneComplete) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["experience"],
        message:
          "Uveďte alespoň jednu relevantní pracovní zkušenost, nebo zaškrtněte „Zatím nemám žádnou praxi“.",
      })
    }
  })

export type ExperienceDocumentSchema = z.infer<typeof experienceDocumentSchema>
