/**
 * Web Push, sent straight from the Worker with WebCrypto (DeepSpace has no push
 * service). Two standards:
 *   - RFC 8291 message encryption (aes128gcm): only the subscribed phone can read the payload.
 *   - RFC 8292 VAPID: a signed JWT that proves the push comes from this app.
 * Keys live in DeepSpace secrets: VAPID_PUBLIC_KEY (65-byte uncompressed P-256
 * point, base64url) and VAPID_PRIVATE_KEY (the 32-byte private scalar, base64url).
 * Unit-tested against the RFC 8291 worked example in webpush.test.ts.
 */

export type PushSubscriptionKeys = {
  endpoint: string
  p256dh: string // the phone's public key (base64url)
  auth: string // the phone's 16-byte auth secret (base64url)
}

export interface VapidKeys {
  publicKey: string
  privateKey: string
  subject: string // an https: or mailto: URL identifying the sender
}

export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number }

// Only real browser push services, so a stored endpoint can never point the Worker at an arbitrary URL.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/]

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname))
  } catch {
    return false
  }
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

// WebCrypto wants ArrayBuffer-backed bytes.
type Bytes = Uint8Array<ArrayBuffer>

const utf8 = (text: string): Bytes => new TextEncoder().encode(text)

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// A P-256 key pair as JWKs, from the raw public point and the private scalar.
function p256Jwk(publicKey: Uint8Array, privateKey?: Uint8Array): JsonWebKey {
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('Expected an uncompressed P-256 public key')
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    ...(privateKey && { d: toBase64Url(privateKey) }),
  }
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8))
}

const RECORD_SIZE = 4096

/**
 * RFC 8291 encryption of one push message. `sender` and `salt` are random per
 * message; tests pass the RFC's fixed values to check the exact bytes.
 */
export async function encryptPushPayload(
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  plaintext: Uint8Array,
  fixed?: { senderPublic: Bytes; senderPrivate: Bytes; salt: Bytes },
): Promise<Bytes> {
  const uaPublic = fromBase64Url(sub.p256dh)
  const authSecret = fromBase64Url(sub.auth)

  let senderPrivate: CryptoKey
  let asPublic: Bytes
  if (fixed) {
    senderPrivate = await crypto.subtle.importKey('jwk', p256Jwk(fixed.senderPublic, fixed.senderPrivate), { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    asPublic = fixed.senderPublic
  } else {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
    senderPrivate = pair.privateKey
    asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))

  const receiver = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiver }, senderPrivate, 256))

  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic)
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32)
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  // One record: the plaintext plus the 0x02 "last record" delimiter.
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(plaintext, new Uint8Array([2]))))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ciphertext)
}

/** RFC 8292 VAPID: the Authorization header value for one push service origin. */
export async function vapidAuthorization(vapid: VapidKeys, endpoint: string, now = Date.now()): Promise<string> {
  const publicKey = fromBase64Url(vapid.publicKey)
  const key = await crypto.subtle.importKey('jwk', p256Jwk(publicKey, fromBase64Url(vapid.privateKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = toBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = toBase64Url(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject })))
  // WebCrypto's ECDSA signature is already the raw r||s form JWS expects.
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${vapid.publicKey}`
}

/** Sends one push. `gone` means the subscription is dead (unsubscribed or expired) and should be deleted. */
export async function sendWebPush(vapid: VapidKeys, sub: PushSubscriptionKeys, payload: object): Promise<PushResult> {
  if (!isPushEndpoint(sub.endpoint)) return { ok: false, gone: true, status: 0 }
  const body = await encryptPushPayload(sub, utf8(JSON.stringify(payload)))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(vapid, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
    },
    body,
  })
  if (res.ok) return { ok: true }
  return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status }
}
