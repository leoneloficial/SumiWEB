import ws from "ws"

const handler = async (m, { conn, usedPrefix }) => {
  const botname = conn.botName || conn.botname || global.botname || "Bot"
  const chat = global.db.data.chats[m.chat]

  const subBots = [
    ...new Set(
      (global.conns || [])
        .filter((c) => c?.user?.jid && c?.ws?.socket && c.ws.socket.readyState !== ws.CLOSED)
        .map((c) => c.user.jid)
    ),
  ]
  if (global.conn?.user?.jid && !subBots.includes(global.conn.user.jid)) subBots.push(global.conn.user.jid)

  const mentionedJid = m.mentionedJid || []
  const who = mentionedJid[0] ? mentionedJid[0] : m.quoted ? await m.quoted.sender : null

  if (!who) return conn.reply(m.chat, `❀ Por favor, menciona a un Socket para hacerlo Bot principal del grupo.`, m)
  if (!subBots.includes(who)) return conn.reply(m.chat, `ꕥ El usuario mencionado no es un Socket de: *${botname}*.`, m)

  if (chat.primaryBot === who) {
    return conn.reply(m.chat, `ꕥ @${who.split("@")[0]} ya está como Bot primario en este grupo.`, m, { mentions: [who] })
  }

  chat.primaryBot = who
  await global.db.write?.().catch(() => {})

  return conn.reply(
    m.chat,
    `❀ Se ha establecido a @${who.split("@")[0]} como Bot primario de este grupo.\n> Ahora los comandos serán ejecutados por @${who.split("@")[0]}.`,
    m,
    { mentions: [who] }
  )
}

handler.help = ["setprimary"]
handler.tags = ["grupo"]
handler.command = ["setprimary"]
handler.group = true
handler.admin = true

export default handler