import { getBotVisual } from '../subbotManager.js'

let handler = async (m, { conn }) => {
  const chatId = m?.chat || m?.key?.remoteJid
  if (!chatId) return

  const botname = globalThis?.nombrebot || 'Bot'
  const visual = getBotVisual(conn)
  const uptimeMs = Math.floor((process.uptime?.() || 0) * 1000)
  const h = Math.floor(uptimeMs / 3600000)
  const min = Math.floor((uptimeMs % 3600000) / 60000)
  const s = Math.floor((uptimeMs % 60000) / 1000)

  const mem = process.memoryUsage?.() || {}
  const rssMB = mem.rss ? (mem.rss / 1024 / 1024).toFixed(1) : null

  const start = Date.now()

  const baseText =
    `✿ *》Ping ${visual.name || botname}《* ✿\n\n` +
    `❑ Ping » *calculando...*\n\n` +
    `> ⚿ Uptime » *${h}h ${min}m ${s}s*\n` +
    (rssMB ? `> ⛁ RAM » *${rssMB} MB*` : '')

  const sentMsg = await conn.sendMessage(chatId, { text: baseText }, { quoted: m })
  const ping = Date.now() - start

  const finalText =
    `✿ *》Ping ${visual.name || botname}《* ✿\n\n` +
    `❑ Ping » *${ping} ms*\n\n` +
    `> ⚿ Uptime » *${h}h ${min}m ${s}s*\n` +
    (rssMB ? `> ⛁ RAM » *${rssMB} MB*` : '')

  await conn.sendMessage(chatId, { text: finalText, edit: sentMsg.key }, {})
}

handler.help = ['ping']
handler.tags = ['info']
handler.command = ['ping', 'p', 'pong']

export default handler