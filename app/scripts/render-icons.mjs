import { chromium } from '@playwright/test'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// Render the splash icon with breathing room on splash indigo.
const destination = fileURLToPath(new URL('../public/bubl/icons/', import.meta.url))
await mkdir(destination, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })
try {
  const page = await browser.newPage()
  const sourceImage = await readFile(new URL('../public/bubl/app-icon-transparent.png', import.meta.url))
  const source = `data:image/png;base64,${sourceImage.toString('base64')}`
  for (const size of [32, 180, 192, 512]) {
    const png = await page.evaluate(async ({ size, source }) => {
      const art = new Image()
      art.src = source
      await art.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const context = canvas.getContext('2d')
      context.fillStyle = '#252b61'
      context.fillRect(0, 0, size, size)
      const scale = size * .82 / Math.max(art.naturalWidth, art.naturalHeight)
      const width = art.naturalWidth * scale, height = art.naturalHeight * scale
      context.drawImage(art, (size - width) / 2, (size - height) / 2, width, height)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { size, source })
    await writeFile(`${destination}icon-${size}.png`, Buffer.from(png, 'base64'))
  }
} finally { await browser.close() }
