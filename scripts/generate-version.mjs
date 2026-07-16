import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SAST_OFFSET_HOURS = 2

function getSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

const now = new Date()
const sast = new Date(now.getTime() + SAST_OFFSET_HOURS * 3600_000)

// e.g. 26.7.16.917 — YY.M.D.H<MM> in SAST
const version = [
  sast.getUTCFullYear() % 100,
  sast.getUTCMonth() + 1,
  sast.getUTCDate(),
  `${sast.getUTCHours()}${String(sast.getUTCMinutes()).padStart(2, '0')}`,
].join('.')

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'version.json'
)

fs.writeFileSync(
  outPath,
  JSON.stringify({ version, sha: getSha(), deployed_at: now.toISOString() }, null, 2) + '\n'
)

console.log(`Wrote ${outPath}: ${version}`)
