import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getSubbotId,
  getUser,
  formatMoney,
  economyDecor,
  safeUserTag,
  getCooldown,
  setCooldown,
  randInt,
  replyText
} from '../biblioteca/economia.js'

const CD = 7 * 24 * 60 * 60 * 1000

const handler = async (m, { conn }) => {
  const subbotId = getSubbotId(conn)
  const userJid = m?.sender

  await withDbLock(subbotId, async () => {
    const db = loadEconomyDb()
    const user = getUser(db, subbotId, userJid)
    const userTag = safeUserTag(conn, m)

    const remain = getCooldown(user, 'weekly')
    if (remain > 0) {
      const text = economyDecor({
        title: 'Ya reclamaste tu semanal.',
        lines: ['> Mira tu tiempo en *.einfo*'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const earned = randInt(250000, 650000)
    user.wallet += earned
    user.stats.weekly = (user.stats.weekly || 0) + 1
    setCooldown(user, 'weekly', CD)

    const text = economyDecor({
      title: `¡Recompensa semanal! +${formatMoney(earned)}`,
      lines: ['> Vuelve la próxima semana.'],
      userTag
    })

    saveEconomyDb(db)
    return await replyText(conn, m, text)
  })
}

handler.command = ['weekly', 'semanal']
handler.tags = ['economy']
handler.help = ['weekly']

export default handler
