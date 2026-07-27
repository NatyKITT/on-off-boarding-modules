import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const pkgPath = path.join(__dirname, "..", "package.json")
const buildInfoPath = path.join(__dirname, "..", "src", "build-info.ts")

const pkgRaw = fs.readFileSync(pkgPath, "utf8")
const pkg = JSON.parse(pkgRaw)

const lifecycle = process.env.npm_lifecycle_event ?? ""
const nodeEnv = process.env.NODE_ENV ?? "development"

const version = String(pkg.version || "0.1.0")

const buildEnv = nodeEnv === "production" ? "production" : "development"

function resolveCommitHash() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)

  try {
    return execSync("git rev-parse --short HEAD", { cwd: __dirname })
      .toString()
      .trim()
  } catch {
    return "unknown"
  }
}

const commitHash = resolveCommitHash()
const buildDate = new Date().toISOString()

const content = `// Tento soubor je generován skriptem scripts/build-info.mjs
// Neupravujte ho ručně.

export const APP_VERSION: string = "${version}";
export const APP_BUILD_ENV: string = "${buildEnv}";
export const APP_NPM_LIFECYCLE: string = "${lifecycle}";
export const APP_BUILD_HASH: string = "${commitHash}";
export const APP_BUILD_DATE: string = "${buildDate}";
`

fs.writeFileSync(buildInfoPath, content, "utf8")

console.log("✅ build-info.ts vygenerován:", {
  version,
  nodeEnv,
  lifecycle,
  commitHash,
  buildDate,
})
