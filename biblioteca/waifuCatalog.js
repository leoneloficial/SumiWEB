import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CHAR_PATH = path.join(__dirname, 'characters.json')

export const RARITY = {
  C: { name: 'Común', value: 1500 },
  R: { name: 'Rara', value: 6000 },
  SR: { name: 'Súper Rara', value: 18000 },
  UR: { name: 'Ultra Rara', value: 60000 },
  LR: { name: 'Legendaria', value: 180000 }
}

export const RARITY_WEIGHTS = {
  C: 65,
  R: 22,
  SR: 9,
  UR: 3,
  LR: 1
}

function safeNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function loadCharacters() {
  try {
    if (!fs.existsSync(CHAR_PATH)) return []
    const raw = fs.readFileSync(CHAR_PATH, 'utf-8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

const _raw = loadCharacters()

const _base = _raw
  .filter((x) => x && (x.id !== undefined) && x.name)
  .map((x) => {
    const id = String(x.id).trim()
    const name = String(x.name || '').trim()
    const gender = String(x.gender || '').trim() || 'Desconocido'
    const source = String(x.source || '').trim() || 'Desconocido'
    const value = safeNum(x.value)
    const img = Array.isArray(x.img) ? x.img.filter(Boolean).map(String) : []
    const vid = Array.isArray(x.vid) ? x.vid.filter(Boolean).map(String) : []
    return { id, name, gender, source, value, img, vid }
  })

const _values = _base.map((w) => w.value).sort((a, b) => a - b)
function percentile(p) {
  if (!_values.length) return 0
  const idx = Math.min(_values.length - 1, Math.max(0, Math.floor((_values.length - 1) * p)))
  return _values[idx]
}
const T_C = percentile(0.60)
const T_R = percentile(0.85)
const T_SR = percentile(0.95)
const T_UR = percentile(0.99)

function rarityForValue(v) {
  const n = safeNum(v)
  if (n >= T_UR) return 'LR'
  if (n >= T_SR) return 'UR'
  if (n >= T_R) return 'SR'
  if (n >= T_C) return 'R'
  return 'C'
}

export const WAIFUS = _base.map((w) => ({
  ...w,
  rarity: rarityForValue(w.value),
  
  anime: w.source
}))

const _byId = new Map(WAIFUS.map((w) => [String(w.id), w]))

export function getWaifuById(id = '') {
  return _byId.get(String(id).trim()) || null
}

function normText(t = '') {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

export function searchWaifus(query = '', limit = 10) {
  const q = normText(query)
  if (!q) return []

  const scored = []
  for (const w of WAIFUS) {
    const id = String(w.id)
    const name = normText(w.name)
    const src = normText(w.source)
    let score = 0

    if (normText(id) === q) score += 100
    if (name === q) score += 90
    if (name.startsWith(q)) score += 60
    if (name.includes(q)) score += 35
    if (src === q) score += 25
    if (src.includes(q)) score += 15
    if (score > 0) scored.push({ w, score })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, Math.max(1, Number(limit) || 10)).map((x) => x.w)
}

export function rarityMeta(code = '') {
  return RARITY[String(code || '').toUpperCase()] || RARITY.C
}

export function pickRandomWaifu() {
  if (!WAIFUS.length) return null
  return WAIFUS[Math.floor(Math.random() * WAIFUS.length)]
}

export function pickByRarityWeighted(weights = RARITY_WEIGHTS) {
  const w = weights || RARITY_WEIGHTS
  const entries = Object.entries(w)
    .map(([k, v]) => [String(k).toUpperCase(), Number(v) || 0])
    .filter(([k, v]) => v > 0 && RARITY[k])

  if (!entries.length) return 'C'

  const total = entries.reduce((a, [, v]) => a + v, 0)
  let r = Math.random() * total
  for (const [k, v] of entries) {
    r -= v
    if (r <= 0) return k
  }
  return entries[entries.length - 1][0] || 'C'
}
