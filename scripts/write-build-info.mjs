// scripts/write-build-info.mjs
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

let version = String(pkg.version || "0.1.0")

if (lifecycle === "prebuild") {
  const [major, minor, patchRaw] = version.split(".")
  const patch = Number(patchRaw || "0") || 0
  version = `${major}.${minor}.${patch + 1}`

  pkg.version = version
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8")
}

const content = `export const APP_VERSION = "${version}"`

fs.writeFileSync(buildInfoPath, content, "utf8")

console.log("✅ build-info.ts vygenerován:", { version, lifecycle })
