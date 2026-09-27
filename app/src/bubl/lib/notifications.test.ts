import { describe, expect, it } from 'vitest';
import { loveNotice, matchNotice, messageNotice, nearbyNotice, waveNotice } from './notifications';

const maya = { id: 'u-maya', name: 'Maya' };
const bubble = { id: 'b1', placeName: 'Broadway & 116th St' };

describe('notification text', () => {
  it('tells the author who loved which bubble', () => {
    expect(loveNotice(maya, bubble)).toEqual({
      kind: 'love',
      title: 'Maya loved your bubble',
      body: 'Your bubble at Broadway & 116th St got some love. Wave back?',
      bubbleId: 'b1',
      fromUserId: 'u-maya',
    });
  });

  it('shows a wave note when there is one, otherwise the place', () => {
    expect(waveNotice(maya, bubble, 'your tip was spot on').body).toBe('“your tip was spot on”');
    expect(waveNotice(maya, bubble).body).toBe('About the bubble at Broadway & 116th St. Wave back to start a chat.');
  });

  it('announces a match with the chat to open', () => {
    expect(matchNotice(maya, 'c1', 'b1')).toMatchObject({ kind: 'match', title: 'You and Maya both waved!', chatId: 'c1' });
  });

  it('previews a message on one line, trimmed to 80 characters', () => {
    const n = messageNotice(maya, 'c1', `hey\n\nmeet at the steps? ${'x'.repeat(100)}`);
    expect(n.title).toBe('Maya');
    expect(n.body).toHaveLength(80);
    expect(n.body.startsWith('hey meet at the steps?')).toBe(true);
    expect(n.body.endsWith('…')).toBe(true);
  });

  it('leaves out "at" when a bubble has no place name', () => {
    expect(loveNotice(maya, { id: 'b2', placeName: '' }).body).toBe('Your bubble got some love. Wave back?');
  });
});

describe('nearbyNotice', () => {
  it('says what kind of bubble and where', () => {
    expect(nearbyNotice({ category: 'Food', placeName: 'Broadway & 116th St' })).toEqual({
      title: 'You drifted into a bubble 🫧',
      body: 'A food bubble at Broadway & 116th St is right here. Tap to pop it.',
    });
  });

  it('leaves out place names that are just coordinates', () => {
    expect(nearbyNotice({ category: 'Park', placeName: '40.80553, -73.96055' }).body).toBe('A park bubble is right here. Tap to pop it.');
    expect(nearbyNotice({ category: 'Misc', placeName: '' }).body).toBe('A bubble is right here. Tap to pop it.');
  });
});
