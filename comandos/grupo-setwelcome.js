import { setWelcomeMessage, getWelcomeMessage } from '../biblioteca/settings.js'

const handler = async (m, ctx) => {
  const { conn, from, isGroup, text, isSubBot, usedPrefix, command } = ctx

  if (!isGroup) {
    await conn.sendMessage(from, { text: '「✦」Este comando solo funciona en grupos.' }, { quoted: m })
    return
  }

  const t = String(text || '').trim()

  if (!t) {
    const cur = getWelcomeMessage(from, isSubBot ? String(conn?.subbotId || '').trim() : '')
    const msg =
`「✦」Uso: *${usedPrefix + command}* <mensaje>

✎ Placeholders:
- {mention}  {username}
- {group}    {desc}
- {bot}

» Actual:
${cur ? cur : '— (default) —'}

✧ Para borrar: *${usedPrefix + command} reset*`
    await conn.sendMessage(from, { text: msg }, { quoted: m })
    return
  }

  if (/^(reset|default|borrar|delete|del)$/i.test(t)) {
    setWelcomeMessage(from, '', isSubBot ? String(conn?.subbotId || '').trim() : '')
    await conn.sendMessage(from, { text: '「✦」Welcome personalizado eliminado. Se usará el predeterminado.' }, { quoted: m })
    return
  }

  setWelcomeMessage(from, t, isSubBot ? String(conn?.subbotId || '').trim() : '')
  await conn.sendMessage(from, { text: '「✦」Welcome personalizado guardado.' }, { quoted: m })
}

handler.help = ['setwelcome <mensaje>', 'setwelcome reset']
handler.tags = ['group']
handler.command = ['setwelcome']
handler.useradm = true

export default handler