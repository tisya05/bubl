import { describe, expect, it } from 'vitest'
import { encryptPushPayload, fromBase64Url, isPushEndpoint, toBase64Url, vapidAuthorization } from './webpush'

// RFC 8291 section 5 / Appendix A: fixed keys and salt, so the output is exact.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('encryptPushPayload', () => {
  it('matches the RFC 8291 worked example byte for byte', async () => {
    const body = await encryptPushPayload({ p256dh: RFC.uaPublic, auth: RFC.auth }, new TextEncoder().encode(RFC.plaintext), {
      senderPublic: fromBase64Url(RFC.asPublic),
      senderPrivate: fromBase64Url(RFC.asPrivate),
      salt: fromBase64Url(RFC.salt),
    })
    expect(toBase64Url(body)).toBe(RFC.body)
  })

  it('uses a fresh key and salt for every message', async () => {
    const sub = { p256dh: RFC.uaPublic, auth: RFC.auth }
    const a = await encryptPushPayload(sub, new TextEncoder().encode('hi'))
    const b = await encryptPushPayload(sub, new TextEncoder().encode('hi'))
    expect(toBase64Url(a)).not.toBe(toBase64Url(b))
    expect(a.length).toBe(16 + 4 + 1 + 65 + 2 + 1 + 16)
  })
})

describe('vapidAuthorization', () => {
  it('signs an ES256 JWT for the push service origin that verifies with the public key', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))
    const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!
    const now = Date.UTC(2026, 8, 27)

    const header = await vapidAuthorization({ publicKey, privateKey, subject: 'https://bubl-divhacks.app.space' }, 'https://web.push.apple.com/abc123', now)
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!
    expect(k).toBe(publicKey)

    const [h, c, s] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(c)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now / 1000 + 12 * 3600,
      sub: 'https://bubl-divhacks.app.space',
    })
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, fromBase64Url(s), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })
})

describe('isPushEndpoint', () => {
  it('accepts the real push services only', () => {
    expect(isPushEndpoint('https://web.push.apple.com/QH4x')).toBe(true)
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true)
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true)
    expect(isPushEndpoint('http://web.push.apple.com/x')).toBe(false)
    expect(isPushEndpoint('https://evil.example/web.push.apple.com')).toBe(false)
    expect(isPushEndpoint('https://web.push.apple.com.evil.example/x')).toBe(false)
    expect(isPushEndpoint('not a url')).toBe(false)
  })
})
