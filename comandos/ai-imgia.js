import fetch from 'node-fetch'
import FormData from 'form-data'
import { generateWAMessageContent, generateWAMessageFromContent, proto } from '@whiskeysockets/baileys'

const CATBOX_API = 'https://catbox.moe/user/api.php'

function esc(s = '') {
  return String(s || '')
    .replace(/\*/g, '＊')
    .replace(/_/g, '＿')
    .replace(/`/g, '｀')
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

async function uploadToCatbox(buffer, filename = 'image.png') {
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, { filename, contentType: 'image/png' })

  const res = await fetch(CATBOX_API, { method: 'POST', body: form })
  const text = await res.text()
  const url = String(text || '').trim()
  if (!res.ok || !url.startsWith('http')) throw new Error('Error subiendo a Catbox: ' + url)
  return url
}

async function fetchWithRetry(url, retries = 3, delayMs = 2000) {
  let lastErr = null
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
      lastErr = new Error(`Error en la API: ${res.status}`)
    } catch (e) {
      lastErr = e
    }
    if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs))
  }
  throw lastErr || new Error('Error desconocido')
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const chat = m.chat || m.key?.remoteJid
  const prompt = (args || []).join(' ').trim()

  if (!prompt) {
    return replyText(
      conn,
      chat,
      `「✦」Generador de Imágenes AI\n\n` +
        `> ✐ Uso » *${usedPrefix + command}* <texto>\n` +
        `> ✐ Ejemplo » *${usedPrefix + command}* gatito kawaii con fondo rosa\n\n` +
        `「✦」Puede tardar unos segundos.`,
      m
    )
  }

  const apikey = globalThis.apikey

  const api1 = `https://api-adonix.ultraplus.click/ai/iaimagen?apikey=${encodeURIComponent(apikey)}&prompt=${encodeURIComponent(prompt)}`
  const api2 = `https://api-adonix.ultraplus.click/ai/magicstudio?apikey=${encodeURIComponent(apikey)}&q=${encodeURIComponent(prompt)}`

  try {
    await reactMsg(conn, chat, m.key, '🕒')
    /*await replyText(conn, chat, `「✦」Generando imágenes...\n> ✐ Prompt » *${esc(prompt)}*`, m)*/

    const [r1, r2] = await Promise.all([fetchWithRetry(api1), fetchWithRetry(api2)])
    const [b1, b2] = await Promise.all([r1.buffer(), r2.buffer()])

    const [url1, url2] = await Promise.all([
      uploadToCatbox(b1, 'iaimagen.png'),
      uploadToCatbox(b2, 'magicstudio.png')
    ])

    const urls = [url1, url2].filter(Boolean)
    if (!urls.length) throw new Error('No se obtuvieron imágenes')

    const namebot = conn.botName || 'Bot'
    const titles = ['❀ IA Imagen (Adonix)', '❀ MagicStudio (Adonix)']

    const cards = []
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]

      const { imageMessage } = await generateWAMessageContent(
        { image: { url } },
        { upload: conn.waUploadToServer }
      )

      cards.push({
        body: proto.Message.InteractiveMessage.Body.fromObject({
          text: `> ✐ Prompt » *${esc(prompt)}*`
        }),
        footer: proto.Message.InteractiveMessage.Footer.fromObject({
          text: "© Ado 2025"
        }),
        header: proto.Message.InteractiveMessage.Header.fromObject({
          title: titles[i],
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
                display_text: '⎘ Copiar prompt',
                copy_code: prompt
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
                text: `「✦」Imágenes generadas para *${esc(prompt)}*`
              }),
              footer: proto.Message.InteractiveMessage.Footer.fromObject({
                text: 'Resultados (Catbox)'
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
  } catch (err) {
    console.error(err)
    await reactMsg(conn, chat, m.key, '✔️')
    await replyText(conn, chat, '「✦」Error al generar imágenes.\n> ✐ Intenta nuevamente.', m)
  }
}

handler.command = ['imgia', 'iaimg']
handler.help = ['imgia <texto>']
handler.tags = ['ia']

export default handler