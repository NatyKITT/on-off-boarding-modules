import { z } from "zod"

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
      message:
        "Datum \u201eOd\u201c nemůže být později než datum \u201eDo\u201c.",
    })

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: toPath,
      message:
        "Datum \u201eDo\u201c nemůže být dříve než datum \u201eOd\u201c.",
    })
  }
}

const experienceEntrySchema = z
  .object({
    employer: optionalTrimmedString,
    jobType: optionalTrimmedString,
    from: optionalDateString,
    to: optionalDateString,
  })
  .superRefine((val, ctx) => {
    const any = !!val.employer || !!val.jobType || !!val.from || !!val.to
    if (!any) return

    if (!val.employer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employer"],
        message: "Uveďte zaměstnavatele.",
      })
    }
    if (!val.jobType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jobType"],
        message: "Uveďte druh práce / činnosti.",
      })
    }
    if (!val.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["from"],
        message: "Uveďte datum \u201eOd\u201c.",
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
        message: "Uveďte datum \u201eOd\u201c.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum \u201eDo\u201c.",
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
        message: "Uveďte datum \u201eOd\u201c.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum \u201eDo\u201c.",
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
        message: "Uveďte datum \u201eOd\u201c.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum \u201eDo\u201c.",
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
        message: "Uveďte datum \u201eOd\u201c.",
      })
    }
    if (!val.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["to"],
        message: "Uveďte datum \u201eDo\u201c.",
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
          message: "Uveďte datum \u201eOd\u201c.",
        })
      }
      if (!val.to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["to"],
          message: "Uveďte datum \u201eDo\u201c.",
        })
      }
    }

    refineDateRange(val, ctx)
  })

export const affidavitSchema = z.object({
  experience: z.array(experienceEntrySchema).default([]),

  militaryService: z.array(militaryEntrySchema).default([]),

  maternityParental: z.array(childCareSchema).default([]),
  continuousCare: z.array(childCareSchema).default([]),
  disabledChildCare: z.array(childCareSchema).default([]),

  closeRelativeCare: z.array(closeRelativeCareSchema).default([]),

  doctoralStudy: z.array(doctoralStudySchema).default([]),

  unpaidLeave: z.array(unpaidLeaveEntrySchema).default([]),

  isTruthful: requiredBoolean("Potvrďte prosím pravdivost údajů.").refine(
    (val) => val,
    "Pro odeslání musíte potvrdit pravdivost údajů."
  ),
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

export const payrollInfoSchema = z.object({
  fullName: requiredTrimmedString("Jméno a příjmení je povinné."),
  maidenName: requiredTrimmedString("Rodné příjmení je povinné."),
  birthPlace: requiredTrimmedString("Místo narození je povinné."),
  birthNumber: optionalTrimmedString,
  maritalStatus: maritalStatusEnum,

  permanentStreet: requiredTrimmedString("Ulice je povinná."),
  permanentHouseNumber: requiredTrimmedString(
    "Číslo popisné / orientační je povinné."
  ),
  permanentCity: requiredTrimmedString("Obec je povinná."),
  permanentPostcode: requiredTrimmedString("PSČ je povinné."),

  children: z.array(payrollChildSchema).default([]),

  healthInsuranceCompany: requiredTrimmedString(
    "Název zdravotní pojišťovny je povinný."
  ),

  bankAccountNumber: requiredTrimmedString("Číslo účtu je povinné."),
  bankName: requiredTrimmedString("Název banky je povinný."),

  confirmTruthfulness: requiredBoolean("Potvrďte prosím prohlášení.").refine(
    (val) => val,
    "Pro odeslání musíte potvrdit prohlášení."
  ),
  signatureDate: requiredTrimmedString("Datum je povinné."),
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

const PRESET_LANGUAGES = [
  "Angličtina",
  "Němčina",
  "Španělština",
  "Francouzština",
] as const

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

export const personalQuestionnaireSchema = z
  .object({
    lastName: requiredTrimmedString("Příjmení je povinné."),
    firstName: requiredTrimmedString("Křestní jméno je povinné."),
    titleBefore: optionalTrimmedString,
    titleAfter: optionalTrimmedString,
    academicDegrees: optionalTrimmedString,
    maidenName: optionalTrimmedString,
    otherSurnames: optionalTrimmedString,

    birthDate: dateString,
    birthNumber: optionalTrimmedString,
    birthPlace: requiredTrimmedString("Místo narození je povinné."),
    birthDistrict: requiredTrimmedString("Okres narození je povinný."),
    birthState: requiredTrimmedString("Stát narození je povinný."),

    phone: optionalTrimmedString,
    citizenship: requiredTrimmedString("Státní občanství je povinné."),

    dataBoxId: optionalTrimmedString,
    dataBoxDelivery: requiredBoolean(
      "Vyberte prosím Ano/Ne (datová schránka)."
    ),

    maritalStatus: z.enum(
      ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "REGISTERED", "UNSTATED"],
      {
        required_error: "Vyberte rodinný stav.",
        invalid_type_error: "Vyberte rodinný stav.",
      }
    ),

    foreignPermitFrom: optionalDateString,
    foreignPermitTo: optionalDateString,
    foreignPermitAuthority: optionalTrimmedString,

    permanentStreet: requiredTrimmedString("Ulice je povinná."),
    permanentHouseNumber: requiredTrimmedString(
      "Číslo popisné / orientační je povinné."
    ),
    permanentCity: requiredTrimmedString("Obec je povinná."),
    permanentPostcode: requiredTrimmedString("PSČ je povinné."),

    correspondenceStreet: optionalTrimmedString,
    correspondenceHouseNumber: optionalTrimmedString,
    correspondenceCity: optionalTrimmedString,
    correspondencePostcode: optionalTrimmedString,

    healthInsuranceCompany: requiredTrimmedString(
      "Zdravotní pojišťovna je povinná."
    ),
    bankAccountNumber: requiredTrimmedString(
      "Číslo účtu pro výplatu mzdy je povinné."
    ),
    bankName: requiredTrimmedString("Název banky je povinný."),

    maintenanceInfo: optionalTrimmedString,

    receivesPensionBenefits: requiredBoolean("Vyberte prosím Ano/Ne (důchod)."),
    typePensionBenefits: optionalTrimmedString,

    isDisabledPerson: requiredBoolean(
      "Vyberte prosím Ano/Ne (ZTP/invalidita)."
    ),
    disabilityDegree: z.enum(["NONE", "I", "II", "III"]).default("NONE"),

    languages: z.array(languageSchema).default([]),

    hasCertificateGeneral: requiredBoolean(
      "Vyberte prosím Ano/Ne (úřednická zkouška)."
    ),
    hasCertificateSpecial: requiredBoolean(
      "Vyberte prosím Ano/Ne (zvláštní odborná způsobilost)."
    ),
    hasCertificateManagement: requiredBoolean(
      "Vyberte prosím Ano/Ne (vedoucí úředníci)."
    ),
    hasCertificateTraining: requiredBoolean(
      "Vyberte prosím Ano/Ne (vstupní školení)."
    ),

    familyRelations: optionalTrimmedString,

    education: z
      .array(educationEntrySchema)
      .min(1, "Uveďte alespoň jedno ukončené vzdělání.")
      .default([]),

    finalRequestPayrollTransfer: requiredBoolean(
      "Potvrďte prosím souhlas (výplata na účet)."
    ).refine((val) => val, "Pro odeslání musíte potvrdit souhlas."),

    finalReadAndUnderstood: requiredBoolean(
      "Potvrďte prosím prohlášení o pravdivosti údajů."
    ).refine((val) => val, "Pro odeslání musíte potvrdit prohlášení."),

    finalTruthfulnessConfirm: requiredBoolean(
      "Potvrďte prosím závěrečné prohlášení."
    ).refine((val) => val, "Pro odeslání musíte potvrdit prohlášení."),
  })
  .superRefine((val, ctx) => {
    if (val.dataBoxDelivery === true && !val.dataBoxId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataBoxId"],
        message: "Zadejte ID datové schránky.",
      })
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
        message: "Vyberate stupeň invalidity.",
      })
    }

    const anyPermit =
      !!val.foreignPermitFrom ||
      !!val.foreignPermitTo ||
      !!val.foreignPermitAuthority

    if (anyPermit) {
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
  })

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
          "Uveďte alespoň jednu relevantní pracovní zkušenost, nebo zaškrtněte \u201eZatím nemám žádnou praxi\u201c.",
      })
    }
  })

export type ExperienceDocumentSchema = z.infer<typeof experienceDocumentSchema>
