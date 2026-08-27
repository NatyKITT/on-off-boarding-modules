export type StatMetric =
  | "onboardings"
  | "offboardings"
  | "onboardingsCancelled"
  | "offboardingsCancelled"
  | "offboardingsDuringProbation"
  | "changes"
  | "documentsCompletion"
  | "probationEvaluationCompletion"

export type StatDimension =
  | "department"
  | "unitName"
  | "positionName"
  | "month"
  | "changeType"
  | "supervisor"
  | "probationLength"
  | "positionType"

export type StatDisplayType =
  | "bar"
  | "barHorizontal"
  | "stacked"
  | "line"
  | "table"

export type StatSection = "planned" | "actual" | "cancelled"

export type StatisticsFilters = {
  year: number
  fromMonth?: number
  toMonth?: number
  department?: string[]
  unitName?: string[]
  positionName?: string[]
  section?: StatSection[]
}

export type StatDatum = {
  label: string
  value: number
  series?: Record<string, number>
}

export type KpiSummary = {
  onboardingsTotal: number
  offboardingsTotal: number
  netGrowth: number
  currentHeadcount: number
  offboardingsDuringProbationPercent: number
  onboardingsCancelledTotal: number
  offboardingsCancelledTotal: number
}

export type MonthlyFlowPoint = {
  month: string
  onboardings: number
  offboardings: number
  headcount: number
}

export type ChangesByTypeMonthPoint = {
  month: string
  POSITION: number
  NAME: number
  NAME_AND_POSITION: number
  MATERNITY_LEAVE: number
}

export type ProcessHealth = {
  documentsCompletedOnTimePercent: number
  probationEvaluationsCompletedPercent: number
  probationEvaluationsAvgDays: number | null
  exitChecklistsFullySignedPercent: number
  avgStartDeviationDays: number | null
  avgEndDeviationDays: number | null
}

export type StatisticsOverview = {
  kpis: KpiSummary
  monthlyFlow: MonthlyFlowPoint[]
  departmentFluctuation: StatDatum[]
  changesByTypeMonthly: ChangesByTypeMonthPoint[]
  processHealth: ProcessHealth
}

export type StatisticsFilterOptions = {
  departments: string[]
  unitNames: string[]
  positionNames: string[]
  years: number[]
}

export type CustomViewRequest = {
  metric: StatMetric
  dimension: StatDimension
  displayType: StatDisplayType
  filters: StatisticsFilters
}

export type CustomViewResult = {
  data: StatDatum[]
}

export const METRIC_LABELS: Record<StatMetric, string> = {
  onboardings: "Nástupy",
  offboardings: "Odchody",
  onboardingsCancelled: "Neuskutečněné nástupy",
  offboardingsCancelled: "Neuskutečněné odchody",
  offboardingsDuringProbation: "Odchody ve zkušební době",
  changes: "Zaměstnanecké změny",
  documentsCompletion: "Dokončenost dokumentů",
  probationEvaluationCompletion: "Dokončenost hodnocení zkušebky",
}

export const DIMENSION_LABELS: Record<StatDimension, string> = {
  department: "Odbor",
  unitName: "Oddělení",
  positionName: "Pozice",
  month: "Měsíc",
  changeType: "Typ změny",
  supervisor: "Vedoucí / mentor",
  probationLength: "Délka zkušební doby",
  positionType: "Manažerská vs. běžná pozice",
}

export const DISPLAY_TYPE_LABELS: Record<StatDisplayType, string> = {
  bar: "Sloupcový graf",
  barHorizontal: "Vodorovný sloupcový graf",
  stacked: "Skládaný graf",
  line: "Čára",
  table: "Tabulka",
}

export const METRIC_ALLOWED_DIMENSIONS: Record<StatMetric, StatDimension[]> = {
  onboardings: [
    "department",
    "unitName",
    "positionName",
    "month",
    "supervisor",
    "probationLength",
    "positionType",
  ],
  offboardings: ["department", "unitName", "positionName", "month"],
  onboardingsCancelled: ["department", "unitName", "positionName", "month"],
  offboardingsCancelled: ["department", "unitName", "positionName", "month"],
  offboardingsDuringProbation: [
    "department",
    "unitName",
    "positionName",
    "month",
  ],
  changes: ["department", "unitName", "positionName", "month", "changeType"],
  documentsCompletion: ["department", "unitName", "positionName", "month"],
  probationEvaluationCompletion: [
    "department",
    "unitName",
    "positionName",
    "month",
  ],
}
