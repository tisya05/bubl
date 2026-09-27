import type { CollectionSchema } from 'deepspace/schema'

const prices = ['Free', '$', '$$', '$$$']
const sources = ['nyc', 'eventbrite', 'nycforfree', 'instagram', 'bubl']
const serverOnly = { create: false, update: false, delete: false } as const

export const eventsSchema: CollectionSchema = {
  name: 'events',
  columns: [
    { name: 'source', storage: 'text', interpretation: { kind: 'select', options: sources }, required: true, immutable: true },
    { name: 'sourceUrl', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'externalId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'authorId', storage: 'text', interpretation: 'plain', immutable: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'description', storage: 'text', interpretation: 'plain' },
    { name: 'imageUrl', storage: 'text', interpretation: 'plain' },
    { name: 'placeName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lng', storage: 'number', interpretation: 'plain' },
    { name: 'startsAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'endsAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'price', storage: 'text', interpretation: { kind: 'select', options: prices }, required: true },
    { name: 'scrapedAt', storage: 'text', interpretation: { kind: 'datetime' }, required: true },
    { name: 'moderation', storage: 'text', interpretation: { kind: 'select', options: ['passed', 'unchecked'] } },
  ],
  ownerField: 'authorId',
  permissions: { viewer: { read: true, ...serverOnly }, member: { read: true, ...serverOnly }, admin: { read: true, ...serverOnly } },
}
