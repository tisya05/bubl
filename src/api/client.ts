// The one API object every screen imports: `import { api } from '../api/client'`.
// Set VITE_USE_MOCK=true to use the in-memory mock until the backend exists.

import type { Api } from '../types';
import { mockApi } from './mock';

const todo = (owner: string) => async (): Promise<never> => {
  throw new Error(`not implemented: ${owner}`);
};

// TODO: replace each stub with the real DeepSpace call.
const realApi: Api = {
  nearbyBubbles: todo('Urvi'),
  canPop: todo('Tisya'),
  loveBubble: todo('Urvi'),
  lovedBy: todo('Urvi'),
  speak: todo('Tisya'),
  translate: todo('Tisya'),
  uploadMedia: todo('Urvi'),
  dropBubble: todo('Tisya'),
  myPopped: todo('Urvi'),
  myDropped: todo('Urvi'),
  sendWave: todo('Urvi'),
  incomingWaves: todo('Urvi'),
  myChats: todo('Urvi'),
  getMessages: todo('Urvi'),
  sendMessage: todo('Urvi'),
};

export const api: Api = import.meta.env.VITE_USE_MOCK === 'true' ? mockApi : realApi;
