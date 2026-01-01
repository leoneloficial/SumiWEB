import fs from 'fs'
import path from 'path'
import session from 'express-session'

function ensureDir(p) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
  } catch {}
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function atomicWriteJson(filepath, data) {
  ensureDir(filepath)
  const tmp = `${filepath}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filepath)
}

export default class JsonFileStore extends session.Store {
  constructor({ path: filePath, ttlMs = 1000 * 60 * 60 * 24 * 365, reapIntervalMs = 1000 * 60 * 15 } = {}) {
    super()
    this.filePath = String(filePath || './webpanel/db/sessions.json')
    this.ttlMs = Number(ttlMs) || 1000 * 60 * 60 * 24 * 365
    this.reapIntervalMs = Number(reapIntervalMs) || 1000 * 60 * 15

    this._cache = { sessions: {} }
    this._dirty = false
    this._flushTimer = null
    this._reapTimer = null

    this._load()
    this._startReaper()
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        ensureDir(this.filePath)
        atomicWriteJson(this.filePath, { sessions: {} })
      }
      const raw = fs.readFileSync(this.filePath, 'utf8')
      const data = safeJsonParse(raw, { sessions: {} })
      this._cache = data && typeof data === 'object' ? data : { sessions: {} }
      if (!this._cache.sessions || typeof this._cache.sessions !== 'object') this._cache.sessions = {}
      this._reapExpired()
    } catch {
      this._cache = { sessions: {} }
    }
  }

  _scheduleFlush() {
    this._dirty = true
    if (this._flushTimer) return
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null
      if (!this._dirty) return
      this._dirty = false
      try {
        atomicWriteJson(this.filePath, this._cache)
      } catch {}
    }, 250)
  }

  _getExpiry(sess) {
    const now = Date.now()
    const c = sess?.cookie || {}
    const exp = c?.expires ? new Date(c.expires).getTime() : 0
    if (Number.isFinite(exp) && exp > 0) return exp
    const maxAge = Number(c?.maxAge || 0)
    if (Number.isFinite(maxAge) && maxAge > 0) return now + maxAge
    return now + this.ttlMs
  }

  _reapExpired() {
    const now = Date.now()
    const sessions = this._cache.sessions || {}
    let changed = false
    for (const [sid, entry] of Object.entries(sessions)) {
      const exp = Number(entry?.expiresAt || 0)
      if (exp && exp < now) {
        delete sessions[sid]
        changed = true
      }
    }
    if (changed) this._scheduleFlush()
  }

  _startReaper() {
    if (this._reapTimer) clearInterval(this._reapTimer)
    this._reapTimer = setInterval(() => this._reapExpired(), this.reapIntervalMs)
    // no mantener vivo el proceso solo por el intervalo
    try {
      this._reapTimer.unref?.()
    } catch {}
  }

  get(sid, cb) {
    try {
      const entry = this._cache.sessions?.[sid]
      if (!entry) return cb?.(null, null)
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        delete this._cache.sessions[sid]
        this._scheduleFlush()
        return cb?.(null, null)
      }
      return cb?.(null, entry.session || null)
    } catch (e) {
      return cb?.(e)
    }
  }

  set(sid, sess, cb) {
    try {
      if (!this._cache.sessions) this._cache.sessions = {}
      this._cache.sessions[sid] = {
        expiresAt: this._getExpiry(sess),
        session: sess
      }
      this._scheduleFlush()
      return cb?.(null)
    } catch (e) {
      return cb?.(e)
    }
  }

  touch(sid, sess, cb) {
    
    try {
      const entry = this._cache.sessions?.[sid]
      if (!entry) return cb?.(null)
      entry.expiresAt = this._getExpiry(sess || entry.session)
      entry.session = sess || entry.session
      this._scheduleFlush()
      return cb?.(null)
    } catch (e) {
      return cb?.(e)
    }
  }

  destroy(sid, cb) {
    try {
      if (this._cache.sessions && this._cache.sessions[sid]) {
        delete this._cache.sessions[sid]
        this._scheduleFlush()
      }
      return cb?.(null)
    } catch (e) {
      return cb?.(e)
    }
  }
}
