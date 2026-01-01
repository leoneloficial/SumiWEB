import fetch from 'node-fetch'

function esc(s = '') {
  return String(s || '')
    .replace(/\*/g, '＊')
    .replace(/_/g, '＿')
    .replace(/`/g, '｀')
}

async function replyText(conn, chat, text, quoted) {
  return conn.sendMessage(chat, { text }, { quoted })
}

async function reactMsg(conn, chat, key, emoji) {
  try {
    return await conn.sendMessage(chat, { react: { text: emoji, key } })
  } catch {
    return null
  }
}

function pickMessage(json) {
  const msg = json?.message
  return typeof msg === 'string' ? msg : ''
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const chat = m.chat || m.key?.remoteJid
  const q = (args || []).join(' ').trim()

  if (!q) {
    return replyText(
      conn,
      chat,
      `「✦」Uso » *${usedPrefix + command}* <texto>\n> ✐ Ejemplo » *${usedPrefix + command}* Hola, ¿quién eres?`,
      m
    )
  }

  try {
    await reactMsg(conn, chat, m.key, '🕒')

    const api = `https://api-adonix.ultraplus.click/ai/gemini?apikey=${globalThis.apikey}&text=${encodeURIComponent(q)}`
    const res = await fetch(api)
    const json = await res.json().catch(() => null)

    if (!json?.status) {
      await reactMsg(conn, chat, m.key, '✔️')
      return replyText(conn, chat, '「✦」Error consultando Gemini.\n> ✐ Intenta nuevamente.', m)
    }

    const msg = pickMessage(json)

    if (!msg) {
      await reactMsg(conn, chat, m.key, '✔️')
      return replyText(conn, chat, '「✦」Gemini no devolvió respuesta.\n> ✐ Intenta nuevamente.', m)
    }

    const text =
      `「✦」 *GEMINI 2.5 Flash*\n\n` +
      `${esc(msg)}`

    await replyText(conn, chat, text, m)
    await reactMsg(conn, chat, m.key, '✔️')
  } catch (e) {
    console.error(e)
    await reactMsg(conn, chat, m.key, '✔️')
    await replyText(conn, chat, '「✦」Error consultando Gemini.\n> ✐ Intenta nuevamente.', m)
  }
}

handler.command = ['gemini', 'gmi', 'ai']
handler.help = ['gemini <texto>']
handler.tags = ['ai']

export default handler