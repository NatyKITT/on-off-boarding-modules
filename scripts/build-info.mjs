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

const content = `// Tento soubor je generován skriptem scripts/build-info.mjs
// Neupravujte ho ručně.

export const APP_VERSION = "${version}";
export const APP_BUILD_ENV = "${buildEnv}";
export const APP_NPM_LIFECYCLE = "${lifecycle}";
`

fs.writeFileSync(buildInfoPath, content, "utf8")

console.log("✅ build-info.ts vygenerován:", {
  version,
  nodeEnv,
  lifecycle,
})
