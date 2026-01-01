import fs from 'fs'
import { writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import os from 'os'
import { execFile } from 'child_process'
import pino from 'pino'
import { downloadMediaMessage } from '@whiskeysockets/baileys'
import fetch from 'node-fetch'
import { FormData, Blob } from 'formdata-node'
import { JSDOM } from 'jsdom'

const logger = pino({ level: 'silent' })

const sendText = (conn, jid, text, quoted) =>
  conn.sendMessage(jid, { text }, { quoted })

const sendVideo = async (conn, jid, bufferOrUrl, caption, quoted) => {
  if (typeof bufferOrUrl === 'string') {
    return conn.sendMessage(jid, { video: { url: bufferOrUrl }, caption }, { quoted })
  }
  const buf = bufferOrUrl
  if (typeof conn.sendFile === 'function') {
    return conn.sendFile(jid, buf, 'tomp4.mp4', caption, quoted, 0, { thumbnail: buf })
  }
  return conn.sendMessage(jid, { video: buf, caption }, { quoted })
}

function execFileP(cmd, args = []) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 140 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message || err)))
      resolve({ stdout, stderr })
    })
  })
}

function unwrapMessage(msg) {
  let m = msg
  for (let i = 0; i < 12; i++) {
    if (!m) return null
    if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message
    else if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message
    else if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message
    else if (m.viewOnceMessageV2Extension?.message) m = m.viewOnceMessageV2Extension.message
    else if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message
    else if (m.editedMessage?.message) m = m.editedMessage.message
    else break
  }
  return m
}

function getContextInfoAny(m) {
  return (
    m?.message?.extendedTextMessage?.contextInfo ||
    m?.msg?.contextInfo ||
    m?.message?.imageMessage?.contextInfo ||
    m?.message?.videoMessage?.contextInfo ||
    m?.message?.documentMessage?.contextInfo ||
    m?.message?.stickerMessage?.contextInfo ||
    null
  )
}

function getQuotedRawAny(m) {
  const ctx = getContextInfoAny(m)
  return (
    m?.quoted?.message ||
    m?.quoted?.msg ||
    ctx?.quotedMessage ||
    null
  )
}

function pickStickerMessageAny(quotedRaw) {
  const raw = unwrapMessage(quotedRaw)
  if (!raw) return null
  if (raw.stickerMessage) return raw.stickerMessage
  for (const k of Object.keys(raw)) {
    const v = raw[k]
    if (v?.stickerMessage) return v.stickerMessage
  }
  return null
}

function isStickerQuoted(m, stickerMsg) {
  if (stickerMsg) return true
  const mt = String(m?.quoted?.mtype || m?.quoted?.type || '').toLowerCase()
  if (mt === 'stickermessage') return true
  const mime = String(m?.quoted?.mimetype || m?.quoted?.msg?.mimetype || '')
  if (/webp/i.test(mime)) return true
  return false
}

function isWebp(buf) {
  if (!buf || buf.length < 16) return false
  const head = buf.slice(0, 12).toString('ascii')
  return head.startsWith('RIFF') && head.includes('WEBP')
}

async function downloadStickerBuffer(conn, m) {
  try {
    if (typeof conn.downloadMediaMessage === 'function' && m?.quoted) {
      const b = await conn.downloadMediaMessage(m.quoted)
      if (Buffer.isBuffer(b) && b.length) return b
    }
  } catch {}

  try {
    if (m?.quoted?.download) {
      const b = await m.quoted.download()
      if (Buffer.isBuffer(b) && b.length) return b
    }
  } catch {}

  const ctx = getContextInfoAny(m)
  const quotedMessageRaw = ctx?.quotedMessage || null
  const stanzaId = ctx?.stanzaId || ctx?.quotedMessageId || null
  const participant = ctx?.participant || null

  try {
    if (quotedMessageRaw && stanzaId) {
      const message = unwrapMessage(quotedMessageRaw) || quotedMessageRaw
      const msg = {
        key: {
          remoteJid: m.chat || m.key?.remoteJid,
          fromMe: false,
          id: stanzaId,
          participant: participant || undefined
        },
        message
      }

      const b = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        {
          logger,
          reuploadRequest: conn?.updateMediaMessage
            ? conn.updateMediaMessage.bind(conn)
            : undefined
        }
      )
      if (Buffer.isBuffer(b) && b.length) return b
    }
  } catch {}

  return null
}

function bufferToBlob(buf) {
  if (Buffer.isBuffer(buf)) return new Blob([buf])
  if (buf instanceof ArrayBuffer) return new Blob([new Uint8Array(buf)])
  if (ArrayBuffer.isView(buf)) return new Blob([buf])
  throw new Error('Buffer inválido')
}

async function webp2mp4Ezgif(source) {
  const isUrl = typeof source === 'string' && /^https?:\/\//i.test(source)
  const form = new FormData()

  if (isUrl) {
    form.append('new-image-url', source)
    form.append('new-image', '')
  } else {
    const blob = bufferToBlob(source)
    form.append('new-image-url', '')
    form.append('new-image', blob, 'image.webp')
  }

  const res = await fetch('https://ezgif.com/webp-to-mp4', { method: 'POST', body: form })
  const html = await res.text()
  const { document } = new JSDOM(html).window

  const form2 = new FormData()
  const obj = {}
  for (const input of document.querySelectorAll('form input[name]')) {
    obj[input.name] = input.value
    form2.append(input.name, input.value)
  }

  const res2 = await fetch('https://ezgif.com/webp-to-mp4/' + obj.file, { method: 'POST', body: form2 })
  const html2 = await res2.text()
  const { document: document2 } = new JSDOM(html2).window

  const src = document2.querySelector('div#output > p.outfile > video > source')?.src
  if (!src) throw new Error('No se pudo obtener el mp4 de ezgif')
  return new URL(src, res2.url).toString()
}

async function webpToMp4Ffmpeg(webpBuf) {
  const stamp = Date.now()
  const dir = os.tmpdir()
  const inPath = join(dir, `tomp4-${stamp}.webp`)
  const outPath = join(dir, `tomp4-${stamp}.mp4`)

  try {
    writeFileSync(inPath, webpBuf)

    await execFileP('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inPath,
      '-an',
      '-movflags', '+faststart',
      '-pix_fmt', 'yuv420p',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30',
      '-c:v', 'libx264',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-preset', 'veryfast',
      '-crf', '28',
      outPath
    ])

    return await fs.promises.readFile(outPath)
  } finally {
    try { unlinkSync(inPath) } catch {}
    try { unlinkSync(outPath) } catch {}
  }
}

const handler = async (m, { conn }) => {
  const quotedRaw = getQuotedRawAny(m)
  const stickerMsg = pickStickerMessageAny(quotedRaw)

  if (!m?.quoted && !getContextInfoAny(m)?.quotedMessage) {
    return sendText(conn, m.chat, '❀ Responda a un *sticker animado* que desea hacer video.', m)
  }

  if (!isStickerQuoted(m, stickerMsg)) {
    return sendText(conn, m.chat, '❀ Responda a un *sticker animado* que desea hacer video.', m)
  }

  const media = await downloadStickerBuffer(conn, m)
  if (!media || !Buffer.isBuffer(media) || !media.length) {
    return sendText(conn, m.chat, '❀ No pude descargar el sticker.', m)
  }

  if (!isWebp(media)) {
    const head = media.slice(0, 12).toString('ascii')
    return sendText(conn, m.chat, `❀ El archivo no es WEBP válido.\n> HEAD: *${head}*\n> Bytes: *${media.length}*`, m)
  }

  let out = null

  try {
    out = await webpToMp4Ffmpeg(media)
  } catch {
    out = null
  }

  if (!out || !Buffer.isBuffer(out) || !out.length) {
    try {
      out = await webp2mp4Ezgif(media)
    } catch (e) {
      const err = String(e?.message || e || '')
      return sendText(conn, m.chat, `❀ La conversión falló.\n*ERROR:* ${err.slice(-700)}`, m)
    }
  }

  await sendVideo(conn, m.chat, out, '✿ Aqui tienes tu *Vídeo.*', m)
}

handler.help = ['tomp4']
handler.tags = ['sticker']
handler.command = ['tovideo', 'tomp4', 'togif']

export default handler