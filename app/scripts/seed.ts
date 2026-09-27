/**
 * Seed data and demo reset, run from Urvi's laptop (needs app/.dev.vars, which
 * `deepspace dev` / `deploy` writes and which holds the app-owner token).
 *
 *   npm run seed:import                 # ../seed/bubbles.csv -> live app
 *   npm run seed:import -- --dry-run    # check the CSV and media, change nothing
 *   npm run demo:reset                  # wipe pops, waves, chats, demo drops
 *   add `-- --target http://localhost:5173` to either to hit a local server
 *
 * HEIC and photos over 4 MB are converted to JPEG first (macOS `sips`).
 *
 * CSV columns: title,note_text,category,latitude,longitude,place_name,media_file,language,author
 * Each row becomes bubble `seed-<title-slug>`, so re-running updates instead of
 * duplicating. Photos/videos in ../seed/media go through /api/media/upload
 * (metadata stripped); uploads are remembered per target so re-runs skip them.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const SEED_DIR = process.env.SEED_DIR ?? join(APP_DIR, '..', 'seed')
const LIVE_URL = 'https://bubl-divhacks.app.space'

const AUTHORS: Record<string, string> = {
  maya: 'sYL8FvOhT463FM0ZH9ajemFvfXqu7XGo',
  dev: 'OHHViJa9Fu4tyKzF8ZnRO7OqDgvTm3qx',
  sam: 'GN08sDkS4Kj0h9JXL6pB2x4OFQBLXQiW',
}
const CATEGORIES = ['Food', 'Cafe', 'Park', 'Street', 'Misc']
const COLUMNS = ['title', 'note_text', 'category', 'latitude', 'longitude', 'place_name', 'media_file', 'language', 'author']
const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
}
const CONVERT_OVER_BYTES = 4 * 1024 * 1024
const extOf = (file: string) => file.slice(file.lastIndexOf('.')).toLowerCase()
const isHeic = (file: string) => ['.heic', '.heif'].includes(extOf(file))

/**
 * Like the app's client-side preparePhoto: HEIC/HEIF and photos over 4 MB
 * become a JPEG at most 2048 px on the long side. Uses macOS's built-in `sips`.
 * Returns the path to upload (the original if nothing needed converting).
 */
export function prepareMedia(path: string, workDir: string): string {
  const isPhoto = MEDIA_TYPES[extOf(path)]?.startsWith('image/')
  if (!isPhoto || (!isHeic(path) && statSync(path).size <= CONVERT_OVER_BYTES)) return path
  const out = join(workDir, `${basename(path, extname(path))}.jpg`)
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', '2048', path, '--out', out], { stdio: 'ignore' })
  return out
}

type Row = Record<string, string>
type SeedBubble = {
  id: string
  authorId: string
  title: string
  text: string
  category: string
  lat: number
  lng: number
  placeName: string
  language: string
  mediaFile?: string
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv
  const flag = (name: string) => rest.includes(name)
  const value = (name: string) => {
    const i = rest.indexOf(name)
    return i >= 0 ? rest[i + 1] : undefined
  }
  return { command, target: (value('--target') ?? LIVE_URL).replace(/\/$/, ''), dryRun: flag('--dry-run') }
}

function ownerToken(): string {
  const file = join(APP_DIR, '.dev.vars')
  if (!existsSync(file)) throw new Error('No app/.dev.vars. Run `npx deepspace dev` once in app/ on the owner’s laptop.')
  const token = readFileSync(file, 'utf8').match(/^APP_OWNER_JWT="?([^"\n]+)"?$/m)?.[1]
  if (!token) throw new Error('No APP_OWNER_JWT in app/.dev.vars')
  return token
}

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''))
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'bubble'

export function toSeedBubbles(csv: string, mediaDir: string): { bubbles: SeedBubble[]; errors: string[] } {
  const [header, ...lines] = parseCsv(csv)
  const errors: string[] = []
  const cols = (header ?? []).map((h) => h.trim().toLowerCase())
  const missing = COLUMNS.filter((c) => !cols.includes(c))
  if (missing.length) return { bubbles: [], errors: [`Missing column(s): ${missing.join(', ')}`] }

  const used = new Map<string, number>()
  const bubbles: SeedBubble[] = []
  lines.forEach((line, i) => {
    const row: Row = Object.fromEntries(cols.map((c, j) => [c, (line[j] ?? '').trim()]))
    const at = `Row ${i + 2}${row.title ? ` ("${row.title}")` : ''}`
    const rowErrors: string[] = []

    const category = CATEGORIES.find((c) => c.toLowerCase() === row.category.toLowerCase())
    const lat = Number(row.latitude)
    const lng = Number(row.longitude)
    const authorId = AUTHORS[row.author.toLowerCase()]
    if (!row.title) rowErrors.push('title is empty')
    if (!row.note_text && !row.media_file) rowErrors.push('note_text is empty (it can only be empty when there is a media_file)')
    if (!row.place_name) rowErrors.push('place_name is empty')
    if (!category) rowErrors.push(`category must be one of ${CATEGORIES.join(', ')}`)
    if (!row.latitude || !Number.isFinite(lat) || Math.abs(lat) > 90) rowErrors.push('latitude is not a number')
    if (!row.longitude || !Number.isFinite(lng) || Math.abs(lng) > 180) rowErrors.push('longitude is not a number')
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat < 40.4 || lat > 41 || lng < -74.3 || lng > -73.6)) {
      rowErrors.push('coordinates are outside NYC (did latitude and longitude get swapped?)')
    }
    if (!authorId) rowErrors.push(`author must be one of ${Object.keys(AUTHORS).join(', ')}`)
    if (row.media_file) {
      if (!MEDIA_TYPES[extOf(row.media_file)]) rowErrors.push('media_file must be .jpg, .png, .webp, .heic, .mp4, .mov, .m4a, .mp3, .webm or .ogg')
      else if (!existsSync(join(mediaDir, row.media_file))) rowErrors.push(`media_file ${row.media_file} is not in seed/media/`)
      else if (isHeic(row.media_file) && process.platform !== 'darwin') rowErrors.push('HEIC files can only be converted on a Mac')
    }
    if (rowErrors.length) {
      errors.push(`${at}: ${rowErrors.join('; ')}`)
      return
    }

    const base = `seed-${slug(row.title)}`
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    bubbles.push({
      id: n === 1 ? base : `${base}-${n}`,
      authorId,
      title: row.title,
      text: row.note_text,
      category: category!,
      lat,
      lng,
      placeName: row.place_name,
      language: row.language || 'en',
      mediaFile: row.media_file || undefined,
    })
  })
  return { bubbles, errors }
}

async function post(target: string, token: string, path: string, body: object) {
  const res = await fetch(`${target}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('The server rejected the owner token (401)')
  return (await res.json()) as { success: boolean; data?: any; error?: string }
}

async function uploadMedia(target: string, token: string, file: string) {
  const bytes = readFileSync(file)
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: MEDIA_TYPES[extOf(file)] }), basename(file))
  const res = await fetch(`${target}/api/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
  const body = (await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))) as {
    success: boolean
    data?: { uploadId: string; mediaType: 'photo' | 'video' | 'audio' }
    error?: string
  }
  if (!body.success || !body.data) throw new Error(`${basename(file)}: ${body.error ?? 'upload failed'}`)
  return body.data
}

async function importSeeds(target: string, dryRun: boolean) {
  const csvPath = join(SEED_DIR, 'bubbles.csv')
  if (!existsSync(csvPath)) throw new Error(`No ${csvPath}`)
  const mediaDir = join(SEED_DIR, 'media')
  const { bubbles, errors } = toSeedBubbles(readFileSync(csvPath, 'utf8'), mediaDir)
  if (errors.length) {
    console.error(`Fix these ${errors.length} row(s) in seed/bubbles.csv, then run again:\n  ${errors.join('\n  ')}`)
    process.exit(1)
  }
  if (bubbles.length === 0) throw new Error('seed/bubbles.csv has no rows')
  console.log(`${bubbles.length} bubble(s) look good${dryRun ? ' (dry run, nothing sent)' : ''}.`)
  if (dryRun) return

  const token = ownerToken()
  const cacheFile = join(SEED_DIR, `.uploads.${new URL(target).host.replace(/[^a-z0-9.-]/gi, '_')}.json`)
  const cache: Record<string, { uploadId: string; mediaType: 'photo' | 'video' | 'audio' }> = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, 'utf8'))
    : {}

  const workDir = mkdtempSync(join(tmpdir(), 'bubl-seed-'))
  const rows = []
  for (const b of bubbles) {
    const { mediaFile, ...bubble } = b
    let media = {}
    if (mediaFile) {
      const path = join(mediaDir, mediaFile)
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
      if (!cache[hash]) {
        const upload = prepareMedia(path, workDir)
        console.log(`  uploading ${mediaFile}${upload !== path ? ' (converted to JPEG)' : ''}...`)
        cache[hash] = await uploadMedia(target, token, upload)
        writeFileSync(cacheFile, JSON.stringify(cache, null, 2))
      }
      media = { mediaUrl: `/api/media/${cache[hash].uploadId}`, mediaType: cache[hash].mediaType }
    }
    rows.push({ ...bubble, ...media })
  }

  let imported = 0
  for (let i = 0; i < rows.length; i += 100) {
    const res = await post(target, token, '/api/actions/importSeedBubbles', { bubbles: rows.slice(i, i + 100) })
    if (!res.success) throw new Error(`Import failed: ${res.error}`)
    imported += res.data.imported
  }
  console.log(`Imported ${imported} bubble(s) into ${target}.`)

  const profiles = await post(target, token, '/api/actions/setupDemoProfiles', {})
  if (profiles.success) console.log(`Demo accounts ready: ${profiles.data.profiles.join(', ')}.`)
  else console.warn(`Demo profiles not set up (owner only): ${profiles.error}`)
}

async function reset(target: string) {
  const res = await post(target, ownerToken(), '/api/actions/resetDemo', {})
  if (!res.success) throw new Error(res.error)
  const c = res.data as Record<string, number>
  console.log(`Reset ${target}: removed ${Object.entries(c).map(([k, v]) => `${v} ${k}`).join(', ')}. Seed bubbles kept.`)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const { command, target, dryRun } = parseArgs(process.argv.slice(2))
  const run = command === 'import' ? importSeeds(target, dryRun) : command === 'reset' ? reset(target) : undefined
  if (!run) {
    console.error('Usage: node scripts/seed.ts import|reset [--target URL] [--dry-run]')
    process.exit(1)
  }
  run.catch((err: Error) => {
    console.error(err.message)
    process.exit(1)
  })
}
