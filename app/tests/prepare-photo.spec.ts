/**
 * preparePhoto runs in the browser before upload. Chromium can't decode real
 * HEIC, so the conversion path is exercised with an image labelled as HEIC;
 * real HEIC decoding only happens in Safari.
 */
import { test, expect } from '@playwright/test'

test('preparePhoto converts HEIC-labelled and oversized photos to JPEG, leaves the rest', async ({ page }) => {
  await page.goto('/')
  const results = await page.evaluate(async () => {
    const { preparePhoto } = await import('/src/bubl/api/prepare-photo.ts')

    const canvasBlob = (w: number, h: number, type: string, noise: boolean) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      if (noise) {
        const img = ctx.createImageData(w, h)
        for (let i = 0; i < img.data.length; i++) img.data[i] = (Math.random() * 256) | 0
        ctx.putImageData(img, 0, 0)
      } else {
        ctx.fillStyle = '#243B64'
        ctx.fillRect(0, 0, w, h)
      }
      return new Promise<Blob>((r) => c.toBlob((b) => r(b!), type))
    }
    const dims = async (f: File) => {
      const b = await createImageBitmap(f)
      return [b.width, b.height]
    }

    const small = new File([await canvasBlob(400, 300, 'image/jpeg', false)], 'small.jpg', { type: 'image/jpeg' })
    const smallOut = await preparePhoto(small)

    const heicLabelled = new File([await canvasBlob(400, 300, 'image/png', false)], 'IMG_0001.HEIC', { type: 'image/heic' })
    const heicOut = await preparePhoto(heicLabelled)

    const garbage = new File([new Uint8Array([1, 2, 3, 4])], 'broken.heic', { type: 'image/heic' })
    const garbageOut = await preparePhoto(garbage)

    const big = new File([await canvasBlob(3000, 2000, 'image/png', true)], 'big.png', { type: 'image/png' })
    const bigOut = await preparePhoto(big)

    const video = new File([new Uint8Array([0, 0, 0, 8])], 'clip.mp4', { type: 'video/mp4' })

    return {
      smallUnchanged: smallOut === small,
      heic: { name: heicOut.name, type: heicOut.type, dims: await dims(heicOut) },
      garbageUnchanged: garbageOut === garbage,
      big: { inBytes: big.size, outBytes: bigOut.size, type: bigOut.type, dims: await dims(bigOut) },
      videoUnchanged: (await preparePhoto(video)) === video,
    }
  })

  expect(results.smallUnchanged).toBe(true)
  expect(results.heic).toEqual({ name: 'IMG_0001.jpg', type: 'image/jpeg', dims: [400, 300] })
  expect(results.garbageUnchanged).toBe(true)
  expect(results.big.inBytes).toBeGreaterThan(4 * 1024 * 1024)
  expect(results.big).toMatchObject({ type: 'image/jpeg', dims: [2048, 1365] })
  expect(results.big.outBytes).toBeLessThan(5 * 1024 * 1024)
  expect(results.videoUnchanged).toBe(true)
})
