export type Position = {
  id: string
  gid?: string
  handle?: string

  num: string
  name: string
  dept_name: string
  unit_name: string

  dept?: string
  unit?: string
  lead?: string
  category?: string
  pay_grade?: string

  personName?: string
  personPersonalNumber?: string
  personGid?: string

  supervisorName?: string
  supervisorEmail?: string
}