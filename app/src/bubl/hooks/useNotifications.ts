// Your notification feed, live. New rows (someone loved your bubble, waved,
// matched, messaged) raise an alert once; older ones just sit in the list.
// Needs DeepSpace's RecordScope, so use it under src/pages/(app)/.

import { useEffect, useMemo, useRef } from 'react';
import { useMutations, useQuery } from 'deepspace';
import { alert } from '../lib/alerts';
import type { BublNotification } from '../types';

type Row = Omit<BublNotification, 'id' | 'createdAt'>;

export function useNotifications() {
  const { records, status } = useQuery<Row>('notifications', { orderBy: 'createdAt', orderDir: 'desc', limit: 50 });
  const { put } = useMutations<Row>('notifications');

  const notifications: BublNotification[] = useMemo(
    () => records.map((r) => ({ ...r.data, read: Boolean(r.data.read), id: r.recordId, createdAt: r.createdAt })),
    [records],
  );

  // Alert only for rows that arrive after the feed first loaded.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (status !== 'ready') return;
    if (!seen.current) {
      seen.current = new Set(notifications.map((n) => n.id));
      return;
    }
    for (const n of notifications) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (!n.read) alert({ kind: n.kind, title: n.title, body: n.body, bubbleId: n.bubbleId, chatId: n.chatId });
    }
  }, [notifications, status]);

  return {
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
    markRead: (ids: string[]) => Promise.all(ids.map((id) => put(id, { read: true }))),
    markAllRead: () => Promise.all(notifications.filter((n) => !n.read).map((n) => put(n.id, { read: true }))),
  };
}
