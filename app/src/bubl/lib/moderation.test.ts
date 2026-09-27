import { describe, expect, it } from 'vitest';
import { expiresAtFor, fallbackTitle, findPii, mediaContentBlock, parseVerdict } from './moderation';

describe('findPii', () => {
  it.each([
    ['email', 'text me at maya.r@gmail.com'],
    ['phone with dashes', 'call 212-555-0123 for the key'],
    ['phone with parens', 'my cell is (917) 555 0199'],
    ['phone with +1', 'whatsapp +1 646.555.0100'],
    ['SSN', 'my ssn is 123-45-6789 lol'],
    ['card number', 'found a card 4111 1111 1111 1111 on the bench'],
  ])('flags a %s', (_, text) => {
    expect(findPii(text)).not.toEqual([]);
  });

  it.each([
    'Best bench at Broadway & 116th St',
    'The $3.50 slice at 2848 Broadway is huge',
    'Open 7am to 11pm, go around 10:30',
    'Zip 10025, built in 1911, 60 steps down',
    'Take the 1 train to 110th St',
  ])('lets a normal note through: %s', (text) => {
    expect(findPii(text)).toEqual([]);
  });

  it('does not treat a random 16-digit number as a card unless it passes Luhn', () => {
    expect(findPii('ticket 1234 5678 9012 3456')).toEqual([]);
  });
});

describe('parseVerdict', () => {
  const good = { allowed: true, reasons: [], suggestedCategory: 'Cafe', suggestedTitle: '  Quiet back room ', language: 'en' };

  it('accepts a well-formed verdict and tidies it', () => {
    expect(parseVerdict(good)).toEqual({ ...good, suggestedTitle: 'Quiet back room' });
  });

  it('always gives a rejection at least one reason', () => {
    expect(parseVerdict({ ...good, allowed: false, reasons: [] })?.reasons).toHaveLength(1);
  });

  it('drops reasons on an allowed note', () => {
    expect(parseVerdict({ ...good, reasons: ['stray'] })?.reasons).toEqual([]);
  });

  it('falls back to en for an odd language code', () => {
    expect(parseVerdict({ ...good, language: 'English' })?.language).toBe('en');
  });

  it.each([
    ['not an object', 'yes'],
    ['missing allowed', { ...good, allowed: undefined }],
    ['unknown category', { ...good, suggestedCategory: 'Nightclub' }],
    ['non-string reasons', { ...good, reasons: [1] }],
  ])('rejects malformed output: %s', (_, raw) => {
    expect(parseVerdict(raw)).toBeNull();
  });
});

describe('expiresAtFor', () => {
  const NOW = Date.parse('2026-09-26T20:00:00.000Z');

  it('floats a week, a month, or forever', () => {
    expect(expiresAtFor('1w', NOW)).toBe('2026-10-03T20:00:00.000Z');
    expect(expiresAtFor('1m', NOW)).toBe('2026-10-26T20:00:00.000Z');
    expect(expiresAtFor('forever', NOW)).toBeUndefined();
  });
});

describe('fallbackTitle', () => {
  it('uses the first few words', () => {
    expect(fallbackTitle('  Best rugelach in the whole neighborhood, trust me ')).toBe('Best rugelach in the whole');
  });
});

describe('mediaContentBlock', () => {
  it('passes photos through and strips a data: prefix', () => {
    expect(mediaContentBlock({ mimeType: 'image/jpeg', base64: 'data:image/jpeg;base64,QUJD' })).toEqual({
      type: 'image',
      data: 'QUJD',
      mime_type: 'image/jpeg',
    });
  });

  it("maps iPhone videos (video/quicktime) to Gemini's video/mov", () => {
    expect(mediaContentBlock({ mimeType: 'video/quicktime', base64: 'QUJD' })).toEqual({ type: 'video', data: 'QUJD', mime_type: 'video/mov' });
    expect(mediaContentBlock({ mimeType: 'video/mp4', base64: 'QUJD' })?.mime_type).toBe('video/mp4');
  });

  it('returns null for types Gemini cannot moderate', () => {
    expect(mediaContentBlock({ mimeType: 'application/pdf', base64: 'QUJD' })).toBeNull();
  });
});
