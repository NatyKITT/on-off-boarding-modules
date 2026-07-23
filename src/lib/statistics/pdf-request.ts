import { z } from "zod"

export const statisticsFiltersSchema = z.object({
  year: z.number().int(),
  fromMonth: z.number().int().min(1).max(12).optional(),
  toMonth: z.number().int().min(1).max(12).optional(),
  department: z.array(z.string()).optional(),
  unitName: z.array(z.string()).optional(),
  positionName: z.array(z.string()).optional(),
  section: z.array(z.enum(["planned", "actual", "cancelled"])).optional(),
})

export const statisticsPdfContentSchema = z.object({
  includeKpis: z.boolean(),
  includeMonthlyFlow: z.boolean(),
  includeDepartmentFluctuation: z.boolean(),
  includeChangesByType: z.boolean(),
  includeProcessHealth: z.boolean(),
  includeDataTable: z.boolean(),
  customView: z
    .object({
      label: z.string(),
      metric: z.string(),
      dimension: z.string(),
      filters: statisticsFiltersSchema,
    })
    .nullish(),
})

export const statisticsPdfRequestSchema = z.object({
  filters: statisticsFiltersSchema,
  content: statisticsPdfContentSchema,
})

export const statisticsPdfEmailRequestSchema =
  statisticsPdfRequestSchema.extend({
    email: z.string().email(),
  })
