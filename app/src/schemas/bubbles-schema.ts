/**
 * Bubble collections.
 *
 * `bubbles` holds sealed content (title, text, media, audio). Clients never
 * write it and only the author can read their own rows; everyone else gets
 * content through the canPop server action.
 *
 * `bubble_previews` is what the map reads: position, place name, category,
 * pop radius. Its recordId is the bubble's recordId. Both are written only by
 * server code (saveBubble).
 *
 * Admins get the same row access as members, so the app owner's client never
 * receives sealed content it hasn't popped.
 */

import type { CollectionSchema } from 'deepspace/schema'

const CATEGORY_OPTIONS = ['Food', 'Cafe', 'Park', 'Street', 'Misc']

const serverWritten = { create: false, update: false, delete: false } as const
const noAccess = { read: false, ...serverWritten } as const
const ownRows = { read: 'own', ...serverWritten } as const
const allRows = { read: true, ...serverWritten } as const

export const bubblesSchema: CollectionSchema = {
  name: 'bubbles',
  columns: [
    { name: 'authorId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'lat', storage: 'number', interpretation: 'plain', required: true },
    { name: 'lng', storage: 'number', interpretation: 'plain', required: true },
    { name: 'placeName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: CATEGORY_OPTIONS }, required: true },
    { name: 'title', storage: 'text', interpretation: 'plain', required: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true },
    { name: 'mediaUrl', storage: 'text', interpretation: 'plain' },
    { name: 'mediaType', storage: 'text', interpretation: { kind: 'select', options: ['photo', 'video'] } },
    { name: 'language', storage: 'text', interpretation: 'plain', required: true },
    { name: 'audioUrl', storage: 'text', interpretation: 'plain' },
    { name: 'popRadiusM', storage: 'number', interpretation: 'plain', required: true },
    { name: 'expiresAt', storage: 'text', interpretation: { kind: 'datetime' } },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['live', 'rejected'] }, required: true },
    { name: 'moderation', storage: 'text', interpretation: { kind: 'select', options: ['passed', 'unchecked'] }, required: true },
  ],
  ownerField: 'authorId',
  permissions: { viewer: noAccess, member: ownRows, admin: ownRows },
}

export const bubblePreviewsSchema: CollectionSchema = {
  name: 'bubble_previews',
  columns: [
    { name: 'lat', storage: 'number', interpretation: 'plain', required: true },
    { name: 'lng', storage: 'number', interpretation: 'plain', required: true },
    { name: 'placeName', storage: 'text', interpretation: 'plain', required: true },
    { name: 'category', storage: 'text', interpretation: { kind: 'select', options: CATEGORY_OPTIONS }, required: true },
    { name: 'popRadiusM', storage: 'number', interpretation: 'plain', required: true },
    { name: 'expiresAt', storage: 'text', interpretation: { kind: 'datetime' } },
  ],
  permissions: { viewer: noAccess, member: allRows, admin: allRows },
}
