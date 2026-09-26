// The one API object every screen imports: `import { api } from '@/bubl/api/client'`.
// Set VITE_USE_MOCK=true to use the in-memory mock until the backend exists.
// Every call resolves to DeepSpace's ActionResult; check `res.success` before reading `res.data`.

import { getAuthToken } from 'deepspace';
import type { ActionResult } from 'deepspace/worker';
import type { Api } from '../types';
import { mockApi } from './mock';

// Calls the DeepSpace server action with the same name (src/actions/index.ts).
async function callAction<T>(name: string, params: object = {}): Promise<ActionResult<T>> {
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAuthToken()}`,
    },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<ActionResult<T>>;
}

const realApi: Api = {
  nearbyBubbles: (input) => callAction('nearbyBubbles', input),
  canPop: (input) => callAction('canPop', input),
  loveBubble: (input) => callAction('loveBubble', input),
  lovedBy: (input) => callAction('lovedBy', input),
  speak: (input) => callAction('speak', input),
  translate: (input) => callAction('translate', input),
  // TODO (Urvi): files go through DeepSpace R2 uploads, not a JSON action.
  uploadMedia: async () => ({ success: false, error: 'not implemented: uploadMedia (Urvi)' }),
  dropBubble: (input) => callAction('dropBubble', input),
  myPopped: () => callAction('myPopped'),
  myDropped: () => callAction('myDropped'),
  sendWave: (input) => callAction('sendWave', input),
  incomingWaves: () => callAction('incomingWaves'),
  myChats: () => callAction('myChats'),
  getMessages: (input) => callAction('getMessages', input),
  sendMessage: (input) => callAction('sendMessage', input),
};

export const api: Api = import.meta.env.VITE_USE_MOCK === 'true' ? mockApi : realApi;
