import { USERS_COLUMNS, type CollectionSchema } from 'deepspace/schema'

export const usersSchema: CollectionSchema = {
  name: 'users',
  columns: [
    ...USERS_COLUMNS,
    // Public profile. Never add location, email-derived or phone fields here.
    { name: 'displayName', storage: 'text', interpretation: 'plain' },
    { name: 'neighborhood', storage: 'text', interpretation: 'plain' },
    { name: 'language', storage: 'text', interpretation: 'plain', default: 'en' },
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: 'own', delete: false },
    member: { read: 'own', create: false, update: 'own', delete: false },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
