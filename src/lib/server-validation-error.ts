export type ServerValidationIssue = {
  path: (string | number)[]
  message: string
}

export class ServerValidationError extends Error {
  issues: ServerValidationIssue[]

  constructor(message: string, issues: ServerValidationIssue[] = []) {
    super(message)
    this.name = "ServerValidationError"
    this.issues = issues
  }
}
