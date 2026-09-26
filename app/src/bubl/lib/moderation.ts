// Drop moderation pieces that don't call anything: the PII pre-check, the Grok
// prompt and output schema, and parsing Grok's answer. Unit-tested in moderation.test.ts.
// The Grok call itself lives server-side in src/actions/moderation.ts.

import { CATEGORIES, type Category, type DropBubbleInput } from '../types';

// ---- PII pre-check ----
// Runs before Grok, so obvious personal info is blocked even when Grok is down.
// Street addresses are left to Grok: a café's address is fine, someone's home isn't.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
// US-style phone numbers: 212-555-0123, (212) 555 0123, +1 212.555.0123
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/** Reasons the text contains personal info, or [] if none was found. */
export function findPii(text: string): string[] {
  const reasons: string[] = [];
  if (EMAIL.test(text)) reasons.push('Contains an email address');
  if (SSN.test(text)) reasons.push('Contains what looks like a Social Security number');
  else if (PHONE.test(text)) reasons.push('Contains a phone number');
  const cards = text.match(CARD_CANDIDATE) ?? [];
  if (cards.some((c) => passesLuhn(c.replace(/\D/g, '')))) reasons.push('Contains what looks like a card number');
  return reasons;
}

// ---- Grok verdict ----

export interface ModerationVerdict {
  allowed: boolean;
  reasons: string[];            // shown to the person dropping, e.g. "Contains a slur"
  suggestedCategory: Category;
  suggestedTitle: string;
  language: string;             // ISO 639-1, e.g. 'en', 'es'
}

export const MODERATION_INSTRUCTIONS = `You moderate notes that locals pin to real places in New York City in an app called bubl.
Anyone nearby can read an approved note, so reject a note (allowed: false) if the text or any image contains:
- hate speech: attacks or slurs targeting people for race, ethnicity, religion, gender, sexual orientation, disability, or similar
- offensive language: harassment, threats, insults aimed at a person or group, sexual content, or promotion of violence or self-harm
- swear words or profanity, even mild or casual (the app is for all ages)
- personal information (PII) about anyone: full names of private individuals, phone numbers, email addresses, home addresses or apartment numbers, license plates, ID or account numbers, or anything that could locate a private person. Names and addresses of businesses, parks, landmarks and public figures are fine.
Everything else is allowed, including negative opinions about places ("the coffee here is bad").
For each problem add one short, plain reason the author will see, without repeating the offending words. Use [] when allowed.
Also suggest the best category (Food, Cafe, Park, Street, or Misc), a short title (at most 6 words, no quotes), and the note's language as an ISO 639-1 code.`;

export const MODERATION_SCHEMA = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
    suggestedCategory: { type: 'string', enum: [...CATEGORIES] },
    suggestedTitle: { type: 'string' },
    language: { type: 'string' },
  },
  required: ['allowed', 'reasons', 'suggestedCategory', 'suggestedTitle', 'language'],
  additionalProperties: false,
} as const;

/** Validates Grok's JSON. Returns null for anything malformed, so the caller treats it as "Grok unavailable". */
export function parseVerdict(raw: unknown): ModerationVerdict | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.allowed !== 'boolean') return null;
  if (!Array.isArray(v.reasons) || !v.reasons.every((r) => typeof r === 'string')) return null;
  if (!CATEGORIES.includes(v.suggestedCategory as Category)) return null;
  if (typeof v.suggestedTitle !== 'string' || typeof v.language !== 'string') return null;

  const reasons = (v.reasons as string[]).map((r) => r.trim()).filter(Boolean);
  return {
    allowed: v.allowed,
    // A rejection always gets at least one reason to show the author.
    reasons: v.allowed ? [] : reasons.length > 0 ? reasons : ['This note breaks bubl’s community rules'],
    suggestedCategory: v.suggestedCategory as Category,
    suggestedTitle: v.suggestedTitle.trim().slice(0, 60),
    language: /^[a-z]{2}$/.test(v.language) ? v.language : 'en',
  };
}

// ---- Drop helpers ----

const DAY_MS = 24 * 60 * 60 * 1000;

export function expiresAtFor(floatsFor: DropBubbleInput['floatsFor'], now = Date.now()): string | undefined {
  if (floatsFor === '1w') return new Date(now + 7 * DAY_MS).toISOString();
  if (floatsFor === '1m') return new Date(now + 30 * DAY_MS).toISOString();
  return undefined;
}

/** Title when neither the author nor Grok gave one: the first few words of the note. */
export function fallbackTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5).join(' ');
  return words.length > 40 ? `${words.slice(0, 40)}…` : words;
}
