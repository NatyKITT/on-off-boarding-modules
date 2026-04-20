import type { Employee } from "@/lib/eos-employees"
import type { EosSuperior } from "@/lib/eos-superior"

export type PersonSourceValue = "USER" | "EOS" | "MANUAL"

export type PersonSnapshot = {
  source: PersonSourceValue | null
  gid: string | null
  titleBefore: string | null
  name: string | null
  surname: string | null
  titleAfter: string | null
  email: string | null
  position: string | null
  department: string | null
  unitName: string | null
  personalNumber: string | null
}

const emptyToNull = (value?: string | null) => {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

export function buildPersonFullName(person: Partial<PersonSnapshot>): string {
  return [
    person.titleBefore ?? "",
    person.name ?? "",
    person.surname ?? "",
    person.titleAfter ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export function snapshotFromEmployee(
  employee: Employee,
  source: PersonSourceValue = "EOS"
): PersonSnapshot {
  return {
    source,
    gid: emptyToNull(employee.gid),
    titleBefore: emptyToNull(employee.titleBefore),
    name: emptyToNull(employee.name),
    surname: emptyToNull(employee.surname),
    titleAfter: emptyToNull(employee.titleAfter),
    email: emptyToNull(employee.email),
    position: emptyToNull(employee.positionName),
    department: emptyToNull(employee.department),
    unitName: emptyToNull(employee.unitName),
    personalNumber: emptyToNull(employee.personalNumber),
  }
}

export function snapshotFromSuperior(
  superior: EosSuperior,
  source: PersonSourceValue = "EOS"
): PersonSnapshot {
  return {
    source,
    gid: emptyToNull(superior.gid),
    titleBefore: emptyToNull(superior.titleBefore),
    name: emptyToNull(superior.name),
    surname: emptyToNull(superior.surname),
    titleAfter: emptyToNull(superior.titleAfter),
    email: emptyToNull(superior.email),
    position: emptyToNull(superior.positionName),
    department: emptyToNull(superior.department),
    unitName: emptyToNull(superior.unitName),
    personalNumber: emptyToNull(superior.personalNumber),
  }
}

export function normalizePersonSnapshot(
  input: Partial<PersonSnapshot> | null | undefined,
  fallbackSource: PersonSourceValue = "MANUAL"
): PersonSnapshot {
  return {
    source: input?.source ?? fallbackSource,
    gid: emptyToNull(input?.gid),
    titleBefore: emptyToNull(input?.titleBefore),
    name: emptyToNull(input?.name),
    surname: emptyToNull(input?.surname),
    titleAfter: emptyToNull(input?.titleAfter),
    email: emptyToNull(input?.email),
    position: emptyToNull(input?.position),
    department: emptyToNull(input?.department),
    unitName: emptyToNull(input?.unitName),
    personalNumber: emptyToNull(input?.personalNumber),
  }
}

export function toSupervisorFields(
  snapshot: PersonSnapshot | null,
  manualOverride = false
) {
  return {
    supervisorSource: snapshot?.source ?? null,
    supervisorManualOverride: manualOverride,
    supervisorGid: snapshot?.gid ?? null,
    supervisorTitleBefore: snapshot?.titleBefore ?? null,
    supervisorName: snapshot?.name ?? null,
    supervisorSurname: snapshot?.surname ?? null,
    supervisorTitleAfter: snapshot?.titleAfter ?? null,
    supervisorEmail: snapshot?.email ?? null,
    supervisorPosition: snapshot?.position ?? null,
    supervisorDepartment: snapshot?.department ?? null,
    supervisorUnitName: snapshot?.unitName ?? null,
    supervisorPersonalNumber: snapshot?.personalNumber ?? null,
  }
}

export function toMentorFields(snapshot: PersonSnapshot | null) {
  return {
    mentorSource: snapshot?.source ?? null,
    mentorGid: snapshot?.gid ?? null,
    mentorTitleBefore: snapshot?.titleBefore ?? null,
    mentorName: snapshot?.name ?? null,
    mentorSurname: snapshot?.surname ?? null,
    mentorTitleAfter: snapshot?.titleAfter ?? null,
    mentorEmail: snapshot?.email ?? null,
    mentorPosition: snapshot?.position ?? null,
    mentorDepartment: snapshot?.department ?? null,
    mentorUnitName: snapshot?.unitName ?? null,
    mentorPersonalNumber: snapshot?.personalNumber ?? null,
  }
}
