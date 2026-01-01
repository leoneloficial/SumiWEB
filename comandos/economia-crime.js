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
  msToHuman,
  pick,
  randInt,
  replyText
} from '../biblioteca/economia.js'

const CD = 45 * 60 * 1000

const SUCCESS = [
  'Hackeaste un cajero automático',
  'Robaste un maletín en plena calle',
  'Hiciste un fraude de criptomonedas',
  'Vendiste datos filtrados'
]

const FAIL = [
  'Te atrapó la policía',
  'La alarma sonó demasiado rápido',
  'Un guardia te reconoció',
  'Te traicionó tu compa'
]

const handler = async (m, { conn }) => {
  const subbotId = getSubbotId(conn)
  const userJid = m?.sender

  await withDbLock(subbotId, async () => {
    const db = loadEconomyDb()
    const user = getUser(db, subbotId, userJid)
    const userTag = safeUserTag(conn, m)

    const remain = getCooldown(user, 'crime')
    if (remain > 0) {
      const text = economyDecor({
        title: 'Aún no puedes usar crime.',
        lines: [`> Vuelve en » *${msToHuman(remain)}*`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const ok = Math.random() < 0.52
    setCooldown(user, 'crime', CD)
    user.stats.crime = (user.stats.crime || 0) + 1

    if (ok) {
      const earned = randInt(50000, 200000)
      user.wallet += earned

      const text = economyDecor({
        title: `¡Crimen exitoso! +${formatMoney(earned)}`,
        lines: [`> ${pick(SUCCESS)} y ganaste *${formatMoney(earned)}*.`],
        userTag
      })

      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const loss = randInt(10000, 80000)
    user.wallet = Math.max(0, user.wallet - loss)

    const text = economyDecor({
      title: `Crimen fallido... -${formatMoney(loss)}`,
      lines: [`> ${pick(FAIL)} y perdiste *${formatMoney(loss)}*.`],
      userTag
    })

    saveEconomyDb(db)
    return await replyText(conn, m, text)
  })
}

handler.command = ['crime', 'crimen']
handler.tags = ['economy']
handler.help = ['crime']

export default handler
           
