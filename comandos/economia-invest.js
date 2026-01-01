import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getSubbotId,
  getUser,
  parseAmount,
  formatMoney,
  economyDecor,
  safeUserTag,
  replyText
} from '../biblioteca/economia.js'

const MIN = 10000
const DURATION = 60 * 60 * 1000 

const handler = async (m, { conn, args }) => {
  const subbotId = getSubbotId(conn)
  const userJid = m?.sender

  await withDbLock(subbotId, async () => {
    const db = loadEconomyDb()
    const user = getUser(db, subbotId, userJid)
    const userTag = safeUserTag(conn, m)

    const now = Date.now()
    const inv = user.invest || { amount: 0, matureAt: 0, multiplier: 1 }

    if (inv.amount > 0 && inv.matureAt > now) {
      const text = economyDecor({
        title: 'Ya tienes una inversión en curso.',
        lines: ['> Revisa el tiempo en *.einfo* y luego usa *.collect*'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (inv.amount > 0 && inv.matureAt <= now) {
      const text = economyDecor({
        title: 'Tu inversión ya está lista para cobrar.',
        lines: ['> Usa *.collect* para reclamarla.'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const amount = parseAmount(args?.[0], user.wallet)
    if (!amount || amount <= 0) {
      const text = economyDecor({
        title: 'Uso: invest <cantidad>',
        lines: ['> Ej: invest 250k'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (amount < MIN) {
      const text = economyDecor({
        title: `La inversión mínima es *${formatMoney(MIN)}*.`,
        lines: ['> Tip: usa *.work* y *.daily* para juntar.'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    if (user.wallet < amount) {
      const text = economyDecor({
        title: 'No tienes suficiente en la billetera.',
        lines: ['> Mira tu dinero en *.einfo*'],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const mult = Math.round((0.8 + Math.random() * 0.8) * 100) / 100
    user.wallet -= amount
    user.invest = {
      amount,
      matureAt: now + DURATION,
      multiplier: mult
    }
    user.stats.invest = (user.stats.invest || 0) + 1

    const text = economyDecor({
      title: `Inversión creada: *${formatMoney(amount)}*`,
      lines: [
        '> Tu retorno será aleatorio.',
        '> Revisa el tiempo en *.einfo* y luego cobra con *.collect*'
      ],
      userTag
    })

    saveEconomyDb(db)
    return await replyText(conn, m, text)
  })
}

handler.command = ['invest', 'invertir', 'inversion']
handler.tags = ['economy']
handler.help = ['invest 250k']

export default handler
