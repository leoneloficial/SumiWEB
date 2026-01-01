import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  gachaDecor,
  safeUserTag,
  replyText
} from '../biblioteca/economia.js'

import { searchWaifus, rarityMeta } from '../biblioteca/waifuCatalog.js'

const LIMIT = 10

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const q = String(text || '').trim()

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const userTag = safeUserTag(conn, m)

    if (!q) {
      const t = gachaDecor({
        title: 'Uso: buscarwaifu <texto>',
        lines: [`> Ej: *${usedPrefix || '.'}${command} makima*`, `> También puedes buscar por origen/anime.`],
        userTag
      })
      saveEconomyDb(db)
      return replyText(conn, m, t)
    }

    const res = searchWaifus(q, LIMIT)
    if (!res.length) {
      const t = gachaDecor({
        title: 'Sin resultados.',
        lines: [`> No encontré coincidencias para *${q}*.`],
        userTag
      })
      saveEconomyDb(db)
      return replyText(conn, m, t)
    }

    const lines = res.map((w, i) => {
      const meta = rarityMeta(w?.rarity)
      const origin = w?.source || w?.anime || 'Desconocido'
      return `> ${(i + 1).toString().padStart(2, '0')}. *${w.name}* (✰ ${meta.name} ${w.rarity})\n  └ ID: *${w.id}* • Origen: *${origin}*`
    })

    lines.push('', `✐ Ver info: *${usedPrefix || '.'}waifuinfo <id>*`)

    const t = gachaDecor({
      title: `Resultados (${res.length}) — ${q}`,
      lines,
      userTag
    })

    saveEconomyDb(db)
    return replyText(conn, m, t)
  })
}

handler.command = ['buscarwaifu', 'searchwaifu', 'buscar', 'wsearch']
handler.tags = ['gacha']
handler.help = ['buscarwaifu <texto>']

export default handler
