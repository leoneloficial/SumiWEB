import {
  withDbLock,
  loadEconomyDb,
  saveEconomyDb,
  getUser,
  normalizeUserJid,
  economyDecor,
  replyText
} from '../biblioteca/economia.js'

function parseBirth(input = '') {
  const raw = String(input || '').trim()
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = Number(m[1])
  const mo = Number(m[2])
  const y = Number(m[3])
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  const now = new Date()
  let age = now.getUTCFullYear() - y
  const mDiff = (now.getUTCMonth() + 1) - mo
  if (mDiff < 0 || (mDiff === 0 && now.getUTCDate() < d)) age -= 1
  if (age < 5 || age > 120) return null
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const display = `${d} de ${meses[mo - 1]} de ${y}`
  const iso = `${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return { display, iso, year: y }
}

function normalizeGenre(input = '') {
  const t = String(input || '').trim().toLowerCase()
  if (!t) return null
  if (['hombre', 'masculino', 'm'].includes(t)) return 'Hombre'
  if (['mujer', 'femenino', 'f'].includes(t)) return 'Mujer'
  if (['otro', 'no binario', 'nobinario', 'nb', 'none'].includes(t)) return 'Otro'
  return null
}

const handler = async (m, { conn, command, usedPrefix, text }) => {
  const userJid = normalizeUserJid(m?.sender)

  await withDbLock('global', async () => {
    const db = loadEconomyDb()
    const user = getUser(db, userJid)

    if (command === 'setprofile') {
      const help = economyDecor({
        title: 'Perfil — configuración',
        lines: [
          '✦ Ingresa la categoría que quieras modificar.\n',
          `• ${usedPrefix}setbirth <01/01/2000>\n> Establece tu cumpleaños.`,
          `• ${usedPrefix}delbirth\n> Borra tu cumpleaños.`,
          `• ${usedPrefix}setgenre <hombre|mujer|otro>\n> Establece tu género.`,
          `• ${usedPrefix}delgenre\n> Borra tu género.`,
          `• ${usedPrefix}setdesc <texto>\n> Establece una descripción.`,
          `• ${usedPrefix}deldesc\n> Borra tu descripción.`
        ]
      })
      saveEconomyDb(db)
      return await replyText(conn, m, help)
    }

    switch (command) {
      case 'setbirth': {
        const birth = parseBirth(text)
        if (!birth) {
          saveEconomyDb(db)
          return await replyText(
            conn,
            m,
            `❀ Debes ingresar una fecha válida.\n\n> Ejemplo » *${usedPrefix + command} 01/01/2000* (día/mes/año)`
          )
        }
        user.birth = birth.display
        user.birthISO = birth.iso
        user.birthYear = birth.year
        saveEconomyDb(db)
        return await replyText(conn, m, `❀ Se ha establecido tu fecha de nacimiento como: *${user.birth}*.`)
      }
      case 'delbirth': {
        if (!user.birth) {
          saveEconomyDb(db)
          return await replyText(conn, m, 'ꕥ No tienes una fecha de nacimiento establecida.')
        }
        user.birth = ''
        user.birthISO = ''
        user.birthYear = 0
        saveEconomyDb(db)
        return await replyText(conn, m, '❀ Tu fecha de nacimiento ha sido eliminada.')
      }
      case 'setgenre':
      case 'setgenero': {
        const g = normalizeGenre(text)
        if (!g) {
          saveEconomyDb(db)
          return await replyText(conn, m, `ꕥ Elige un género válido.\n> Ejemplo: *${usedPrefix + command} hombre*`) 
        }
        user.genre = g
        saveEconomyDb(db)
        return await replyText(conn, m, `❀ Se ha establecido tu género como: *${user.genre}*.`)
      }
      case 'delgenre': {
        if (!user.genre) {
          saveEconomyDb(db)
          return await replyText(conn, m, 'ꕥ No tienes un género asignado.')
        }
        user.genre = ''
        saveEconomyDb(db)
        return await replyText(conn, m, '❀ Tu género ha sido eliminado.')
      }
      case 'setdescription':
      case 'setdesc': {
        if (!text) {
          saveEconomyDb(db)
          return await replyText(conn, m, `❀ Escribe una descripción.\n\n> Ejemplo » *${usedPrefix + command} Hola, uso WhatsApp!*`)
        }
        user.description = String(text).slice(0, 400)
        saveEconomyDb(db)
        return await replyText(conn, m, `❀ Descripción guardada. Revisa con *${usedPrefix}perfil*.`)
      }
      case 'deldescription':
      case 'deldesc': {
        if (!user.description) {
          saveEconomyDb(db)
          return await replyText(conn, m, 'ꕥ No tienes una descripción establecida.')
        }
        user.description = ''
        saveEconomyDb(db)
        return await replyText(conn, m, '❀ Tu descripción ha sido eliminada.')
      }
      default: {
        saveEconomyDb(db)
        return
      }
    }
  })
}

handler.help = [
  'setprofile',
  'setbirth',
  'delbirth',
  'setgenre',
  'setgenero',
  'delgenre',
  'setdesc',
  'deldesc'
]
handler.tags = ['perfil']
handler.command = [
  'setprofile',
  'setbirth',
  'delbirth',
  'setgenre',
  'setgenero',
  'delgenre',
  'setdescription',
  'setdesc',
  'deldescription',
  'deldesc'
]

export default handler
