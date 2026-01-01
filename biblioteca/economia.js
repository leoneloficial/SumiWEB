import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { jidNormalizedUser } from '@whiskeysockets/baileys'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, '../db/economia.json')

const defaultDb = {
  version: 2,
  users: {},
  bySubbot: {},
  waifus: {},
  market: {}
}

const _locks = new Map() 

function ensureDirFor(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function now() {
  return Date.now()
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function normalizeId(id = '') {
  return String(id || '').trim()
}

function canonicalUserJid(jidOrNum = '') {
  const raw = String(jidOrNum || '').trim()
  if (!raw) return ''

  if (/@g\.us$/i.test(raw)) return raw

  let jid = raw
  try {
    if (jid.includes('@')) jid = jidNormalizedUser(jid)
  } catch {}

  if (/@lid$/i.test(jid)) return jid

  if (!jid.includes('@')) {
    const num = jid.replace(/\D/g, '')
    return num ? `${num}@s.whatsapp.net` : jid
  }

  return jid
}

export function normalizeUserJid(jidOrNum = '') {
  return canonicalUserJid(jidOrNum)
}

function ensureUserJid(raw = '') {
  const s = String(raw || '').trim()
  if (!s) return ''
  if (/@(s\.whatsapp\.net|lid|g\.us)$/i.test(s)) return canonicalUserJid(s)
  const num = s.replace(/\D/g, '')
  return num ? `${num}@s.whatsapp.net` : canonicalUserJid(s)
}

async function getPNForLID(conn, lidJid = '') {
  const lid = canonicalUserJid(lidJid)
  if (!lid || !/@lid$/i.test(lid)) return ''
  const repo = conn?.signalRepository?.lidMapping
  if (!repo || typeof repo.getPNForLID !== 'function') return ''
  try {
    const pn = await repo.getPNForLID(lid)
    const pnJid = ensureUserJid(pn)
    return /@s\.whatsapp\.net$/i.test(pnJid) ? pnJid : ''
  } catch {
    return ''
  }
}

export async function resolveUserJid(conn, jidOrNum = '') {
  const jid = ensureUserJid(jidOrNum)
  if (!jid) return ''
  if (!/@lid$/i.test(jid)) return jid
  const pn = await getPNForLID(conn, jid)
  return pn || jid
}

export function jidToNum(jid = '') {
  const j = String(jid || '')
  const num = j.includes('@') ? j.split('@')[0] : j
  return `+${String(num || '').replace(/\D/g, '')}`
}

export async function getNameSafe(conn, jidOrNum = '') {
  let jid = canonicalUserJid(jidOrNum)
  // Prefer resolving @lid to a phone-number JID when possible
  try {
    if (/@lid$/i.test(jid)) {
      const resolved = await resolveUserJid(conn, jid)
      if (resolved && !/@lid$/i.test(resolved)) jid = canonicalUserJid(resolved)
    }
  } catch {}

  const num = jidToNum(jid)

  try {
    if (typeof conn?.getName === 'function') {
      const n = await conn.getName(jid).catch(() => '')
      if (n) return n
    }
  } catch {}

  try {
    if (typeof conn?.profileName === 'function') {
      const n = await conn.profileName(jid).catch(() => '')
      if (n) return n
    }
  } catch {}

  try {
    const store = conn?.store || global?.store
    const contact = store?.contacts?.[jid]
    const n =
      contact?.name ||
      contact?.notify ||
      contact?.verifiedName ||
      contact?.vname ||
      ''
    if (n) return n
  } catch {}

  return num
}

export function getSubbotId(conn) {

  return 'global'
}

export function withDbLock(key, fn) {
  const lockKey = 'GLOBAL_ECONOMY'
  const prev = _locks.get(lockKey) || Promise.resolve()
  const next = prev
    .catch(() => {})
    .then(async () => fn())
    .finally(() => {
      if (_locks.get(lockKey) === next) _locks.delete(lockKey)
    })
  _locks.set(lockKey, next)
  return next
}

function mergeUserInto(target, incoming) {
  if (!incoming) return
  if (!target.createdAt) target.createdAt = incoming.createdAt || now()

  target.wallet = Math.max(Number(target.wallet || 0), Number(incoming.wallet || 0))
  target.bank = Math.max(Number(target.bank || 0), Number(incoming.bank || 0))

  target.stats = target.stats || {}
  const inStats = incoming.stats || {}
  for (const k of Object.keys(inStats)) {
    target.stats[k] = Math.max(Number(target.stats[k] || 0), Number(inStats[k] || 0))
  }

  target.cooldowns = target.cooldowns || {}
  const inCds = incoming.cooldowns || {}
  for (const k of Object.keys(inCds)) {
    target.cooldowns[k] = Math.max(Number(target.cooldowns[k] || 0), Number(inCds[k] || 0))
  }

  target.daily = target.daily || { streak: 0, lastClaimAt: 0 }
  if (incoming.daily) {
    target.daily.streak = Math.max(Number(target.daily.streak || 0), Number(incoming.daily.streak || 0))
    target.daily.lastClaimAt = Math.max(Number(target.daily.lastClaimAt || 0), Number(incoming.daily.lastClaimAt || 0))
  }

  target.invest = target.invest || { amount: 0, matureAt: 0, multiplier: 1 }
  if (incoming.invest) {
    if (Number(incoming.invest.amount || 0) > Number(target.invest.amount || 0)) {
      target.invest.amount = Number(incoming.invest.amount || 0)
      target.invest.multiplier = Number(incoming.invest.multiplier || 1)
    }
    target.invest.matureAt = Math.max(Number(target.invest.matureAt || 0), Number(incoming.invest.matureAt || 0))
  }

  
  if (Array.isArray(incoming.waifus)) {
    const set = new Set([...(target.waifus || []), ...incoming.waifus])
    target.waifus = [...set]
  }
  if (incoming.lastRoll) {
    target.lastRoll = target.lastRoll || { id: '', at: 0 }
    if (Number(incoming.lastRoll.at || 0) > Number(target.lastRoll.at || 0)) {
      target.lastRoll = { id: String(incoming.lastRoll.id || ''), at: Number(incoming.lastRoll.at || 0) }
    }
  }
}

export function loadEconomyDb() {
  ensureDirFor(DB_PATH)
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2))
    return { ...defaultDb }
  }
  const raw = fs.readFileSync(DB_PATH, 'utf-8')
  const data = safeJsonParse(raw, null) || { ...defaultDb }

  const db = {
    version: 2,
    users: data?.users || {},
    bySubbot: data?.bySubbot || {},
    waifus: data?.waifus || {},
    market: data?.market || {}
  }

  try {
    const users = db.users || {}
    for (const k of Object.keys(users)) {
      const m = String(k).match(/^([0-9]{16,})@s\.whatsapp\.net$/i)
      if (!m) continue
      const lid = `${m[1]}@lid`
      if (!users[lid]) users[lid] = {}
      mergeUserInto(users[lid], users[k])
      delete users[k]
    }
  } catch {}

  try {
    const bs = db.bySubbot || {}
    for (const sid of Object.keys(bs)) {
      const rootUsers = bs?.[sid]?.users || {}
      for (const jid of Object.keys(rootUsers)) {
        if (!db.users[jid]) db.users[jid] = {}
        mergeUserInto(db.users[jid], rootUsers[jid])
      }
    }
  } catch {}

  return db
}

export function saveEconomyDb(db) {
  ensureDirFor(DB_PATH)
  const tmp = DB_PATH + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DB_PATH)
}

function ensureSubbotRoot(db, subbotId) {
 
  if (!db.bySubbot) db.bySubbot = {}
  if (!db.bySubbot[subbotId]) db.bySubbot[subbotId] = { users: {} }
  if (!db.bySubbot[subbotId].users) db.bySubbot[subbotId].users = {}
  return db.bySubbot[subbotId]
}

export function getUser(db, subbotIdOrJid, maybeJid) {
  const uid = canonicalUserJid(normalizeId(maybeJid ? maybeJid : subbotIdOrJid))
  if (!db.users) db.users = {}

  if (!db.users[uid]) {
    db.users[uid] = {
      wallet: 0,
      bank: 0,
      createdAt: now(),
      stats: {
        work: 0,
        crime: 0,
        slut: 0,
        rob: 0,
        slot: 0,
        beg: 0,
        weekly: 0,
        pay: 0,
        coinflip: 0,
        roulette: 0,
        invest: 0,
        collect: 0
      },
      cooldowns: {},
      daily: {
        streak: 0,
        lastClaimAt: 0
      },
      invest: {
        amount: 0,
        matureAt: 0,
        multiplier: 1
      },
      waifus: [],
      lastRoll: { id: '', at: 0 },
      favWaifu: '',

      birth: '',
      birthISO: '', 
      birthYear: 0,
      genre: '',
      description: '',
      marry: ''
    }
  }
  const u = db.users[uid]
  if (typeof u.wallet !== 'number') u.wallet = 0
  if (typeof u.bank !== 'number') u.bank = 0
  if (typeof u.birthISO !== 'string') u.birthISO = ''
  if (typeof u.birthYear !== 'number') u.birthYear = 0
  if (!u.stats)
    u.stats = {
      work: 0,
      crime: 0,
      slut: 0,
      rob: 0,
      slot: 0,
      beg: 0,
      weekly: 0,
      pay: 0,
      coinflip: 0,
      roulette: 0,
      invest: 0,
      collect: 0
    }
  for (const k of [
    'work',
    'crime',
    'slut',
    'rob',
    'slot',
    'beg',
    'weekly',
    'pay',
    'coinflip',
    'roulette',
    'invest',
    'collect'
  ]) {
    if (typeof u.stats[k] !== 'number') u.stats[k] = 0
  }
  if (!u.cooldowns) u.cooldowns = {}
  if (!u.daily) u.daily = { streak: 0, lastClaimAt: 0 }
  if (!u.invest) u.invest = { amount: 0, matureAt: 0, multiplier: 1 }
  if (!Array.isArray(u.waifus)) u.waifus = []
  if (!u.lastRoll) u.lastRoll = { id: '', at: 0 }
  if (typeof u.lastRoll.at !== 'number') u.lastRoll.at = 0
  if (typeof u.lastRoll.id !== 'string') u.lastRoll.id = ''
  if (typeof u.favWaifu !== 'string') u.favWaifu = ''

  if (typeof u.birth !== 'string') u.birth = ''
  if (typeof u.genre !== 'string') u.genre = ''
  if (typeof u.description !== 'string') u.description = ''
  if (typeof u.marry !== 'string') u.marry = ''
  if (typeof u.invest.amount !== 'number') u.invest.amount = 0
  if (typeof u.invest.matureAt !== 'number') u.invest.matureAt = 0
  if (typeof u.invest.multiplier !== 'number') u.invest.multiplier = 1
  return u
}

export function getWaifuState(db, waifuId) {
  if (!db.waifus) db.waifus = {}
  const id = normalizeId(waifuId)
  if (!db.waifus[id]) {
    db.waifus[id] = {
      owner: '',
      claimedAt: 0
    }
  }
  const w = db.waifus[id]
  if (typeof w.owner !== 'string') w.owner = ''
  w.owner = canonicalUserJid(w.owner)
  if (typeof w.claimedAt !== 'number') w.claimedAt = 0
  return w
}

export function getMarketEntry(db, waifuId) {
  if (!db.market) db.market = {}
  const id = normalizeId(waifuId)
  return db.market[id] || null
}

export function setMarketEntry(db, waifuId, entryOrNull) {
  if (!db.market) db.market = {}
  const id = normalizeId(waifuId)
  if (!entryOrNull) {
    delete db.market[id]
    return
  }
  db.market[id] = {
    waifuId: id,
    price: Math.max(0, Math.floor(Number(entryOrNull.price || 0))),
    seller: canonicalUserJid(normalizeId(entryOrNull.seller || '')),
    listedAt: Number(entryOrNull.listedAt || now())
  }
}

function _pickHeaderGlyph(title = '') {
  const t = String(title || '').toLowerCase()
  if (/descargando|download|downloading/.test(t)) return '「✦」'
  if (/aún no puedes|aun no puedes|cooldown|vuelve en|espera|de nuevo en|ya has reclamado/.test(t)) return '《✧》'
  if (/uso|incorrecto|debes|opci[oó]n inv[aá]lida|error/.test(t)) return '「✦」'
  return '「✿」'
}

function _normalizeLines(lines = []) {
  return (Array.isArray(lines) ? lines : [])
    .map((l) => String(l ?? ''))
    .map((l) => {
      if (!l.trim()) return ''
      const s = l.trim()
      if (s.startsWith('>') || s.startsWith('*') || s.startsWith('「') || s.startsWith('《')) return l
      return `> ${s}`
    })
}

export function gachaDecor({ title, lines = [], userTag = '', showUserTag = false }) {
  const glyph = _pickHeaderGlyph(title)
  const header = `${glyph}${title}`
  const bodyLines = _normalizeLines(lines)
  const body = bodyLines.length ? bodyLines.join('\n') : ''
  const userLine = showUserTag && userTag ? `\n\n> ✿ Usuario » *${userTag}*` : ''
  return `${header}${body ? `\n\n${body}` : ''}${userLine}`.trim()
}

export function formatMoney(amount, symbol = '¥', currencyName = (globalThis?.moneda || '').trim()) {
  const n = Math.floor(Number(amount) || 0)
  const abs = Math.abs(n)
  const parts = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = n < 0 ? '-' : ''
  const suffix = currencyName ? ` ${currencyName}` : ''
  return `${sign}${symbol}${parts}${suffix}`
}

export function parseAmount(input, walletOrBankMax = 0) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) return null
  if (raw === 'all' || raw === 'todo' || raw === 'toda' || raw === 't') return walletOrBankMax

  const m = raw.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i)
  if (!m) {
    const num = Number(raw.replace(/[, ]/g, ''))
    if (!Number.isFinite(num) || num <= 0) return null
    return Math.floor(num)
  }
  const base = Number(m[1])
  if (!Number.isFinite(base) || base <= 0) return null
  const suf = (m[2] || '').toLowerCase()
  const mult = suf === 'k' ? 1e3 : suf === 'm' ? 1e6 : suf === 'b' ? 1e9 : 1
  return Math.floor(base * mult)
}

export function msToHuman(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s <= 0) return 'Ahora.'
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60

  const parts = []
  if (days) parts.push(`${days} día${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hora${hours === 1 ? '' : 's'}`)
  if (mins) parts.push(`${mins} minuto${mins === 1 ? '' : 's'}`)
  if (!parts.length) parts.push(`${secs} segundo${secs === 1 ? '' : 's'}`)
  else if (secs) parts.push(`${secs} segundo${secs === 1 ? '' : 's'}`)

  return parts.slice(0, 2).join(' ')
}

export function getCooldown(user, key) {
  const until = Number(user?.cooldowns?.[key] || 0)
  const remain = until - now()
  return remain > 0 ? remain : 0
}

export function setCooldown(user, key, ms) {
  if (!user.cooldowns) user.cooldowns = {}
  user.cooldowns[key] = now() + Math.max(0, ms)
}

export function addWallet(user, delta) {
  user.wallet = Math.max(0, Math.floor((user.wallet || 0) + delta))
}

export function addBank(user, delta) {
  user.bank = Math.max(0, Math.floor((user.bank || 0) + delta))
}

export function totalWealth(user) {
  return Math.floor((user.wallet || 0) + (user.bank || 0))
}

export function computeUserExp(user) {
  const stats = user?.stats && typeof user.stats === 'object' ? user.stats : {}
  let exp = 0
  for (const v of Object.values(stats)) {
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) exp += Math.floor(n)
  }
  const wealth = Math.floor(Number(user?.wallet || 0) + Number(user?.bank || 0))
  exp += Math.floor(Math.max(0, wealth) / 250000)
  return exp
}

export function levelFromExp(exp) {
  const e = Math.max(0, Math.floor(Number(exp) || 0))
  return Math.floor(Math.sqrt(e / 10))
}

export function expForNextLevel(level) {
  const lv = Math.max(0, Math.floor(Number(level) || 0))
  return (lv + 1) * (lv + 1) * 10
}

export function economyDecor({
  title,
  lines = [],
  userTag = '',
  showUserTag = false,
  cooldowns = [],
  stats = []
}) {
  const glyph = _pickHeaderGlyph(title)
  const header = `${glyph}${title}`

  const bodyLines = _normalizeLines(lines)
  const body = bodyLines.length ? bodyLines.join('\n') : ''

  const cdBlock = cooldowns.length
    ? `\n\n${cooldowns
        .map((c) => `> ⴵ ${c.name} » *${c.value}*`)
        .join('\n')}`
    : ''

  const statsBlock = stats.length
    ? `\n\n${stats
        .map((s) => `> ${s.k} » *${s.v}*`)
        .join('\n')}`
    : ''

  const userLine = showUserTag && userTag ? `\n\n> ✿ Usuario » *${userTag}*` : ''

  return `${header}${body ? `\n\n${body}` : ''}${userLine}${cdBlock}${statsBlock}`.trim()
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function randInt(min, max) {
  const a = Math.ceil(min)
  const b = Math.floor(max)
  return Math.floor(Math.random() * (b - a + 1)) + a
}

export function withinDayWindow(lastAt) {
  
  const DAY = 24 * 60 * 60 * 1000
  return now() - Number(lastAt || 0) < DAY
}

export function streakResetNeeded(lastAt) {
  
  const TWO_DAYS = 48 * 60 * 60 * 1000
  return Number(lastAt || 0) > 0 && now() - Number(lastAt) > TWO_DAYS
}

export function safeUserTag(conn, m) {
  const name = m?.pushName || ''
  const jid = m?.sender || m?.key?.participant || ''
  const num = (jid || '').split('@')[0]
  const base = name ? name : num ? num : 'Usuario'
  return String(base).slice(0, 32)
}

export async function replyText(conn, m, text, extra = {}) {
  try {
    const hasExtra = extra && Object.keys(extra).length > 0
    if (typeof m?.reply === 'function' && !hasExtra) return await m.reply(text)
    return await conn.sendMessage(m.chat, { text, ...(extra || {}) }, { quoted: m })
  } catch {
   
  }
}

