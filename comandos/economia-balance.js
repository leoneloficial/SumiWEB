import { jidNormalizedUser } from '@whiskeysockets/baileys'

import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getSubbotId,
  getUser,
  formatMoney,
  economyDecor,
  safeUserTag,
  totalWealth,
  resolveUserJid,
  replyText
} from '../biblioteca/economia.js'

function normalizeJid(jid = '') {
  return jid ? jidNormalizedUser(jid) : ''
}

function getDecodeJid(conn) {
  return typeof conn?.decodeJid === 'function'
    ? conn.decodeJid.bind(conn)
    : (jid) => normalizeJid(jid)
}

function getParticipantJid(p = {}, decodeJid) {
  const raw = p?.jid || p?.id || p?.participant || ''
  return decodeJid(raw)
}

function getUserId(userId = '') {
  return String(userId || '').split('@')[0]
}

async function resolveLidToPnJid(conn, chatJid, candidateJid) {
  const jid = normalizeJid(candidateJid)
  if (!jid || !jid.endsWith('@lid')) return jid
  if (!chatJid || !String(chatJid).endsWith('@g.us')) return jid
  if (typeof conn?.groupMetadata !== 'function') return jid

  try {
    const meta = await conn.groupMetadata(chatJid)
    const participants = Array.isArray(meta?.participants) ? meta.participants : []

    const found = participants.find(p => {
      const pid = normalizeJid(p?.id || '')
      const plid = normalizeJid(p?.lid || '')
      const pjid = normalizeJid(p?.jid || '')
      return pid === jid || plid === jid || pjid === jid
    })

    const mapped = normalizeJid(found?.jid || '')
    return mapped || jid
  } catch {
    return jid
  }
}

async function pickTargetJid(m, conn) {
  const decodeJid = getDecodeJid(conn)
  const chatJid = decodeJid(m?.chat || m?.key?.remoteJid || m?.from || '')

  const ctx =
    m?.message?.extendedTextMessage?.contextInfo ||
    m?.msg?.contextInfo ||
    {}

  const mentioned =
    m?.mentionedJid ||
    ctx?.mentionedJid ||
    ctx?.mentionedJidList ||
    []

  if (Array.isArray(mentioned) && mentioned.length) {
    const raw = decodeJid(mentioned[0])
    const fixed = await resolveLidToPnJid(conn, chatJid, raw)
    return decodeJid(fixed)
  }

  const text =
    m?.text ||
    m?.body ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    ''

  if (conn?.parseMention) {
    const parsed = conn.parseMention(String(text))
    if (parsed?.length) {
      const raw = decodeJid(parsed[0])
      const fixed = await resolveLidToPnJid(conn, chatJid, raw)
      return decodeJid(fixed)
    }
  }

  const quotedCtx =
    m?.quoted?.msg?.contextInfo ||
    m?.quoted?.contextInfo ||
    {}

  const qRaw =
    getParticipantJid(m?.quoted?.participant, decodeJid) ||
    getParticipantJid(ctx?.participant, decodeJid) ||
    getParticipantJid(quotedCtx?.participant, decodeJid)

  if (qRaw) {
    const fixed = await resolveLidToPnJid(conn, chatJid, qRaw)
    return decodeJid(fixed)
  }

  return ''
}

async function ensureUserJid(conn, m, raw = '') {
  const decodeJid = getDecodeJid(conn)
  const chatJid = decodeJid(m?.chat || m?.key?.remoteJid || m?.from || '')

  const s = String(raw || '').trim()
  if (!s) return null

  if (/@(s\.whatsapp\.net|lid|g\.us)$/i.test(s)) {
    const decoded = decodeJid(s)
    const fixed = await resolveLidToPnJid(conn, chatJid, decoded)
    const r = await resolveUserJid(conn, fixed)
    const out = decodeJid(r || fixed)
    return out && !/@lid$/i.test(out) ? out : null
  }

  const num = s.replace(/\D/g, '')
  const jid = num ? `${num}@s.whatsapp.net` : null
  if (!jid) return null

  const r = await resolveUserJid(conn, jid)
  const out = decodeJid(r || jid)
  return out && !/@lid$/i.test(out) ? out : null
}

async function getNameSafeLocal(conn, jid) {
  const id = normalizeJid(jid)
  if (!id) return ''

  try {
    if (typeof conn?.getName === 'function') {
      const name = await conn.getName(id)
      return String(name || '').trim()
    }
  } catch {}

  try {
    const n = conn?.contacts?.[id]?.notify || conn?.contacts?.[id]?.name || ''
    return String(n || '').trim()
  } catch {}

  return ''
}

const handler = async (m, { conn }) => {
  const subbotId = getSubbotId(conn)

  const senderJid =
    (await ensureUserJid(conn, m, m?.sender)) ||
    (await resolveUserJid(conn, m?.sender))

  const picked = await pickTargetJid(m, conn)

  const target =
    picked
      ? (await ensureUserJid(conn, m, picked)) || (await resolveUserJid(conn, picked))
      : senderJid

  await withDbLock(subbotId, async () => {
    const db = loadEconomyDb()
    const user = getUser(db, subbotId, target)

    const userTag = safeUserTag(conn, m)
    const tid = getUserId(target)
    const isSelf = normalizeJid(target) === normalizeJid(senderJid)

    const targetName = isSelf ? '' : (await getNameSafeLocal(conn, target))
    const label = !isSelf && targetName ? `${targetName} (@${tid})` : `@${tid}`

    const text = economyDecor({
      title: isSelf ? `ᥫ᭡informacion-balanceᰔᩚ ` : `Balance de ${label}`,
      lines: [
        `> ⛀ Billetera » *${formatMoney(user.wallet)}*`,
        `> ⚿ Banco » *${formatMoney(user.bank)}*`,
        `> ⛁ Total » *${formatMoney(totalWealth(user))}*`
      ],
      userTag
    })

    saveEconomyDb(db)

    if (isSelf) return await replyText(conn, m, text)
    return await replyText(conn, m, text, { mentions: [target] })
  })
}

handler.command = ['balance', 'bal', 'coins', 'money']
handler.tags = ['economy']
handler.help = ['bank', 'balance @user', 'balance (respondiendo)']

export default handler