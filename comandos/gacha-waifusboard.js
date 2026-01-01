import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getNameSafe,
  gachaDecor,
  replyText,
  resolveUserJid
} from '../biblioteca/economia.js'

import { getWaifuById, rarityMeta } from '../biblioteca/waifuCatalog.js'

function fmt(n) {
  const x = Math.floor(Number(n) || 0)
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function effectiveValue(w, st) {
  const meta = rarityMeta(w?.rarity)
  const base = Number(w?.value) || Number(meta?.value) || 0
  const boost = Math.max(0, Math.floor(Number(st?.voteBoost || 0)))
  return base + boost
}

const handler = async (m, { conn, args }) => {
  const limit = Math.min(30, Math.max(5, Math.floor(Number(args?.[0] || 10))))

  await withDbLock('global', async () => {
    const db = loadEconomyDb()

    const waifuStates = db.waifus || {}
    const rows = []

    for (const [id, st] of Object.entries(waifuStates)) {
      const owner = String(st?.owner || '').trim()
      if (!owner) continue
      const w = getWaifuById(id)
      if (!w) continue
      rows.push({ id, owner, w, st, val: effectiveValue(w, st) })
    }

    rows.sort((a, b) => b.val - a.val)
    const top = rows.slice(0, limit)

    if (!top.length) {
      const t = gachaDecor({
        title: 'Aún no hay personajes reclamados.',
        lines: [`> Usa *.rw* y *.c* para empezar.`]
      })
      saveEconomyDb(db)
      return replyText(conn, m, t)
    }

    const lines = []
    for (let i = 0; i < top.length; i++) {
      const r = top[i]
      const meta = rarityMeta(r.w?.rarity)
      const ownerResolved = await resolveUserJid(conn, r.owner)
      const ownerName = await getNameSafe(conn, ownerResolved || r.owner)
      const boost = Math.max(0, Math.floor(Number(r.st?.voteBoost || 0)))
      lines.push(
        `> ${(i + 1).toString().padStart(2, '0')}. *${r.w?.name || r.id}* (✰ ${meta.name} ${r.w?.rarity})\n  └ ID: *${r.id}* • Valor: *¥${fmt(r.val)}*${boost ? ` (↑${fmt(boost)})` : ''} • Dueño: *${ownerName}*`
      )
    }

    const t = gachaDecor({
      title: `Top Waifus por Valor (Top ${top.length})`,
      lines
    })

    saveEconomyDb(db)
    return replyText(conn, m, t)
  })
}

handler.command = ['waifusboard', 'waifustop', 'topwaifus', 'wtop']
handler.tags = ['gacha']
handler.help = ['waifusboard [número]']

export default handler
