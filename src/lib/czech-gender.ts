const CZECH_TITLE_WORDS =
  /^(ing|mgr|bc|mudr|judr|phdr|rndr|doc|prof|mba|dis|csc|ph\.d)\.?$/i

function guessCzechSurnameIsFemale(displayName?: string | null): boolean {
  const parts = (displayName ?? "")
    .trim()
    .split(/\s+/)
    .filter((part) => part && !CZECH_TITLE_WORDS.test(part.replace(/\.$/, "")))

  const surname = parts[parts.length - 1] ?? ""

  return /á$/i.test(surname)
}

export function genderedPastVerb(
  displayName: string | null | undefined,
  maleForm: string,
  femaleForm: string
): string {
  if (!displayName?.trim()) return `${maleForm}(a)`
  return guessCzechSurnameIsFemale(displayName) ? femaleForm : maleForm
}
