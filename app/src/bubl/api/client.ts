// The one API object every screen imports: `import { api } from '@/bubl/api/client'`.
// Set VITE_USE_MOCK=true to use the in-memory mock until the backend exists.
// Every call resolves to DeepSpace's ActionResult; check `res.success` before reading `res.data`.

import { getAuthToken } from 'deepspace';
import type { ActionResult } from 'deepspace/worker';
import type { Api } from '../types';
import { mockApi } from './mock';
import { preparePhoto } from './prepare-photo';

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

// Media goes through our own route (metadata stripping, private storage), not a JSON action.
async function uploadMedia(file: File): Promise<ActionResult<{ uploadId: string; mediaType: 'photo' | 'video' }>> {
  const body = new FormData();
  body.append('file', await preparePhoto(file));
  const res = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await getAuthToken()}` },
    body,
  });
  if (!res.ok) return { success: false, error: `Upload failed (${res.status})` };
  return res.json() as Promise<ActionResult<{ uploadId: string; mediaType: 'photo' | 'video' }>>;
}

const realApi: Api = {
  nearbyBubbles: (input) => callAction('nearbyBubbles', input),
  canPop: (input) => callAction('canPop', input),
  openPopped: (input) => callAction('openPopped', input),
  loveBubble: (input) => callAction('loveBubble', input),
  lovedBy: (input) => callAction('lovedBy', input),
  speak: (input) => callAction('speak', input),
  translate: (input) => callAction('translate', input),
  uploadMedia,
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
