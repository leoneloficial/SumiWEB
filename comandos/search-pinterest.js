import fetch from 'node-fetch'
import { getBotVisual } from '../subbotManager.js'
import { generateWAMessageContent, generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'

function esc(s = '') {
  return String(s || '')
    .replace(/\*/g, '＊')
    .replace(/_/g, '＿')
    .replace(/`/g, '｀')
}

function pickResults(data) {
  const arr = data?.results
  return Array.isArray(arr) ? arr : []
}

async function replyText(conn, chat, text, quoted) {
  return conn.sendMessage(chat, { text }, { quoted })
}

async function reactMsg(conn, chat, key, emoji) {
  try {
    return await conn.sendMessage(chat, { react: { text: emoji, key } })
  } catch {
    return null
  }
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const chat = m.chat || m.key?.remoteJid
  const q = (args || []).join(' ').trim()
  const visual = getBotVisual(conn)

  if (!q) {
    return replyText(
      conn,
      chat,
      `「✦」Uso » *${usedPrefix + command}* <texto>\n> ✐ Ejemplo » *${usedPrefix + command} memes*`,
      m
    )
  }

  try {
    await reactMsg(conn, chat, m.key, '🕒')

    const api = `https://api-adonix.ultraplus.click/search/pinterest?apikey=${globalThis.apikey}&q=${encodeURIComponent(q)}`
    const res = await fetch(api)
    const json = await res.json()

    const urls = pickResults(json)
      .filter(u => typeof u === 'string' && u.startsWith('http'))
      .slice(0, 6)

    if (!urls.length) {
      await reactMsg(conn, chat, m.key, '✔️')
      return replyText(conn, chat, `「✦」Resultados para *${esc(q)}*\n\n「✦」Sin resultados.`, m)
    }

    const namebot = visual.name
    const cards = []

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]

      const { imageMessage } = await generateWAMessageContent(
        { image: { url } },
        { upload: conn.waUploadToServer }
      )

      cards.push({
        body: proto.Message.InteractiveMessage.Body.fromObject({
          text: `> ✐ Búsqueda » *${esc(q)}*\n> ❍ Resultado » *${i + 1}/${urls.length}*`
        }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({
          text: namebot
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: `❀ Pinterest`,
          hasMediaAttachment: true,
          imageMessage
        }),
        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.fromObject({
          buttons: [
            {
              name: 'cta_url',
              buttonParamsJson: JSON.stringify({
                display_text: '🜸 Ver imagen',
                url
              })
            },
            {
              name: 'cta_copy',
              buttonParamsJson: JSON.stringify({
                display_text: '⎘ Copiar link',
                copy_code: url
              })
            }
          ]
        })
      })
    }

    const carousel = generateWAMessageFromContent(
      chat,
      {
        viewOnceMessage: {
          message: {
            interactiveMessage: proto.Message.InteractiveMessage.fromObject({
              body: proto.Message.InteractiveMessage.Body.fromObject({
                text: `「✦」Resultados para *${esc(q)}*`
              }),
              footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: `❍ Mostrando ${urls.length} imágenes`
              }),
              header: proto.Message.InteractiveMessage.Header.fromObject({
                hasMediaAttachment: false
              }),
              carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.fromObject({
                cards
              })
            })
          }
        }
      },
      { quoted: m }
    )

    await conn.relayMessage(chat, carousel.message, { messageId: carousel.key.id })
    await reactMsg(conn, chat, m.key, '✔️')
  } catch (e) {
    console.error(e)
    await reactMsg(conn, chat, m.key, '✔️')
    await replyText(conn, chat, '「✦」Error buscando en Pinterest.\n> ✐ Intenta nuevamente.', m)
  }
}

handler.command = ['pin', 'pinterest', 'pint']
handler.help = ['pin <texto>']
handler.tags = ['search']

export default handler