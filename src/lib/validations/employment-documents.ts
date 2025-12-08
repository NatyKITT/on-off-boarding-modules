import { z } from "zod"

const childCareSchema = z.object({
  childName: z.string().optional(),
  childBirthDate: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})

export const affidavitSchema = z.object({
  militaryService: z.enum(["NONE", "BASIC", "ALTERNATIVE", "CIVIL"]),
  maternityParental: z.array(childCareSchema),
  continuousCare: z.array(childCareSchema),
  disabledChildCare: z.array(childCareSchema),
  unpaidLeave: z.array(
    z.object({
      reason: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    })
  ),
  isTruthful: z
    .boolean()
    .refine((val) => val, "Pro pokračování musíte souhlasit."),
})

export type AffidavitSchema = z.infer<typeof affidavitSchema>

export const childSchema = z.object({
  fullName: z.string().optional(),
  birthDate: z.string().optional(),
})

export const educationEntrySchema = z.object({
  level: z.enum([
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
  ]),
  schoolType: z.string().min(1, "Uveďte druh školy / obor."),
  semesters: z.string().optional(),
  studyForm: z.enum([
    "DENNI",
    "VECERNI",
    "DALKOVE",
    "DISTANCNI",
    "KOMBINOVANE",
  ]),
  graduationYear: z.string().optional(),
  examType: z.string().optional(),
})

export const experienceEntrySchema = z.object({
  employer: z.string().min(1, "Zadejte zaměstnavatele."),
  jobType: z.string().min(1, "Zadejte druh práce / činnosti."),
  from: z.string().min(1, "Zadejte datum začátku."),
  to: z.string().optional(),
})

export const educationDocumentSchema = z.object({
  education: z
    .array(educationEntrySchema)
    .min(1, "Uveďte alespoň jedno vzdělání."),
})
export type EducationDocumentSchema = z.infer<typeof educationDocumentSchema>

export const experienceDocumentSchema = z.object({
  experience: z
    .array(experienceEntrySchema)
    .min(1, "Uveďte alespoň jednu pracovní zkušenost."),
})
export type ExperienceDocumentSchema = z.infer<typeof experienceDocumentSchema>

export const languageLevelEnum = z.enum([
  "A0",
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
])

const languageSchema = z.object({
  name: z.string(),
  level: languageLevelEnum,
})

export const personalQuestionnaireSchema = z.object({
  lastName: z.string().min(1, "Příjmení je povinné"),
  firstName: z.string().min(1, "Křestní jméno je povinné"),
  titleBefore: z.string().optional(),
  titleAfter: z.string().optional(),
  academicDegrees: z.string().optional(),
  maidenName: z.string().optional(),
  otherSurnames: z.string().optional(),

  birthDate: z.string().min(1, "Datum narození je povinné"),
  birthNumber: z.string().min(1, "Rodné číslo je povinné"),
  birthPlace: z.string().min(1, "Místo narození je povinné"),
  birthDistrict: z.string().min(1, "Obec narození je povinná"),
  birthState: z.string().min(1, "Stát narození je povinný"),

  phone: z.string().optional(),
  citizenship: z.string().min(1, "Státní občanství je povinné"),
  dataBoxId: z.string().optional(),
  dataBoxDelivery: z.boolean(),

  maritalStatus: z.enum([
    "SINGLE",
    "MARRIED",
    "DIVORCED",
    "WIDOWED",
    "REGISTERED",
    "UNSTATED",
  ]),

  foreignPermitFrom: z.string().optional(),
  foreignPermitTo: z.string().optional(),
  foreignPermitAuthority: z.string().optional(),

  permanentStreet: z.string().min(1, "Ulice je povinná"),
  permanentHouseNumber: z
    .string()
    .min(1, "Číslo popisné / orientační je povinné"),
  permanentCity: z.string().min(1, "Obec je povinná"),
  permanentPostcode: z.string().min(1, "PSČ je povinné"),

  correspondenceStreet: z.string().optional(),
  correspondenceHouseNumber: z.string().optional(),
  correspondenceCity: z.string().optional(),
  correspondencePostcode: z.string().optional(),

  healthInsuranceCompany: z.string().min(1, "Zdravotní pojišťovna je povinná"),
  bankAccountNumber: z
    .string()
    .min(1, "Číslo účtu pro výplatu mzdy je povinné"),
  bankName: z.string().min(1, "Název bankovního ústavu je povinný"),

  maintenanceInfo: z.string().optional(),

  receivesPensionBenefits: z.boolean(),
  typePensionBenefits: z.string().optional(),

  isDisabledPerson: z.boolean(),
  disabilityDegree: z.enum(["NONE", "I", "II", "III"]).default("NONE"),

  children: z.array(childSchema).default([]),

  languages: z.array(languageSchema).default([]),

  hasCertificateGeneral: z.boolean(),
  hasCertificateSpecial: z.boolean(),
  hasCertificateManagement: z.boolean(),
  hasCertificateTraining: z.boolean(),

  familyRelations: z.string().optional(),
  finalRequestPayrollTransfer: z
    .boolean()
    .refine((val) => val, "Pro pokračování musíte souhlasit."),
  finalReadAndUnderstood: z
    .boolean()
    .refine((val) => val, "Pro pokračování musíte souhlasit."),
  finalTruthfulnessConfirm: z
    .boolean()
    .refine((val) => val, "Pro pokračování musíte souhlasit."),
})

export type PersonalQuestionnaireSchema = z.infer<
  typeof personalQuestionnaireSchema
>
