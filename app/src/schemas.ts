/**
 * Collection Schemas
 *
 * All collections with columns and RBAC permissions.
 * Single source of truth — imported by both worker and frontend.
 *
 * Add schemas by creating a file in src/schemas/ and importing it here.
 */

import type { CollectionSchema } from 'deepspace/schema'
import { usersSchema } from './schemas/users-schema'
import { settingsSchema } from './schemas/admin-schema'
import { bubblesSchema, bubblePreviewsSchema, mediaUploadsSchema } from './schemas/bubbles-schema'
import { popsSchema, wavesSchema, chatsSchema, messagesSchema } from './schemas/social-schema'

export const schemas: CollectionSchema[] = [
  usersSchema,
  settingsSchema,
  bubblesSchema,
  bubblePreviewsSchema,
  mediaUploadsSchema,
  popsSchema,
  wavesSchema,
  chatsSchema,
  messagesSchema,
]
