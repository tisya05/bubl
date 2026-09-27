/**
 * notify: drop a notification into one user's private feed, and (with `env`)
 * push it to their phones as a real notification. Server-only.
 *
 * Call it from the action that caused the event, after the event succeeded:
 *   await notify(tools, authorId, loveNotice({ id: userId, name }, { id: bubbleId, placeName }), env)
 * Never throws and never fails the calling action: a missed notification is
 * better than a failed love / wave / message.
 */

import type { ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import type { NotificationDraft } from '../bubl/lib/notifications'
import { pushToUser } from './push'

// Where tapping the phone notification takes you.
function urlFor(draft: NotificationDraft): string {
  if (draft.kind === 'match' || draft.kind === 'message') return '/home?view=chats'
  if (draft.kind === 'wave') return '/home?view=waves'
  return '/home?view=you'
}

export async function notify(tools: ActionTools, recipientId: string, draft: NotificationDraft, env?: Env): Promise<void> {
  if (!recipientId || recipientId === draft.fromUserId) return
  try {
    const res = await tools.create('notifications', { userId: recipientId, ...draft, read: false })
    if (!res.success) console.warn(`[notify] could not notify: ${res.error}`)
  } catch (err) {
    console.warn(`[notify] could not notify: ${err instanceof Error ? err.message : 'unknown error'}`)
  }
  if (env) await pushToUser(tools, env, recipientId, { title: draft.title, body: draft.body, url: urlFor(draft), tag: draft.chatId ?? draft.bubbleId ?? draft.kind })
}

/** A user's display name for notification text, falling back to a neutral one. */
export async function displayName(tools: ActionTools, userId: string): Promise<string> {
  const res = await tools.get<{ name?: string }>('users', userId)
  return (res.success && res.data.record.data.name) || 'Someone'
}
