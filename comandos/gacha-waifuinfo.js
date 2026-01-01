import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getWaifuState,
  getNameSafe,
  gachaDecor,
  safeUserTag,
  replyText
} from '../biblioteca/economia.js'

import { getWaifuById, rarityMeta } from '../biblioteca/waifuCatalog.js'

const handler = async (m, { conn, args }) => {
  const waifuId = String(args?.[0] || '').trim()

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const userTag = safeUserTag(conn, m)

    if (!waifuId) {
      const text = gachaDecor({
        title: 'Uso: waifuinfo <id>',
        lines: [`> Ej: *${m.usedPrefix || '.'}waifuinfo w010*`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const w = getWaifuById(waifuId)
    if (!w) {
      const text = gachaDecor({
        title: 'ID inválida.',
        lines: [`> Ese ID no existe en el catálogo.`],
        userTag
      })
      saveEconomyDb(db)
      return await replyText(conn, m, text)
    }

    const meta = rarityMeta(w.rarity)
    const st = getWaifuState(db, waifuId)
    const inMarket = db.market?.[waifuId]

    let ownerText = 'Libre'
    if (st.owner) {
      const ownerName = await getNameSafe(conn, st.owner)
      ownerText = `Reclamada por *${ownerName}*`
    }

    const value = Number(w.value) || Number(meta.value) || 0

    const lines = [
      `> ❏ ID » *${w.id}*`,
      `> ✰ Rareza » *${meta.name} (${w.rarity})*`,
      `> ❐ Origen » *${w.source}*`,
      `> ♡ Valor » *¥${value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}*`,
      `> ⌁ Estado » *${ownerText}*`
    ]

    if (inMarket) {
      const pretty = Number(inMarket.price || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      lines.push(`> 🛒 En mercado » *Sí* (¥${pretty})`)
    } else {
      lines.push(`> 🛒 En mercado » *No*`)
    }

    const text = gachaDecor({
      title: `Info — ${w.name}`,
      lines,
      userTag
    })

    saveEconomyDb(db)
    await replyText(conn, m, text)
  })
}

handler.command = ['charinfo', 'waifuinfo', 'winfo', 'waifu', 'infochar']
handler.tags = ['gacha']
handler.help = ['waifuinfo <id>']

export default handler
