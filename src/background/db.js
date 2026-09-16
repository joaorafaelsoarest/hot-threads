import Dexie from 'dexie';

export const db = new Dexie('hot_threads');
db.version(1).stores({
  threads: '&id, isPinned, pinnedAt',
  access_logs: '++id, threadId, timestamp'
});

export async function upsertThread(thread) {
  const existing = await db.threads.get(thread.id);
  const next = {
    ...existing,
    ...thread,
    id: thread.id,
    isPinned: thread.isPinned === undefined ? existing?.isPinned ?? false : thread.isPinned,
    pinnedAt: thread.pinnedAt === undefined ? existing?.pinnedAt ?? null : thread.pinnedAt
  };
  await db.threads.put(next);
  return next;
}

export function getThreadState(threadId) {
  return db.threads.get(threadId);
}

export async function togglePin(thread) {
  const current = await upsertThread(thread);
  const isPinned = !current.isPinned;
  const updated = { ...current, isPinned, pinnedAt: isPinned ? Date.now() : null };
  await db.threads.put(updated);
  return updated;
}

export async function recordAccess(thread, now = Date.now()) {
  await upsertThread(thread);
  const latest = await db.access_logs.where('threadId').equals(thread.id).sortBy('timestamp').then((logs) => logs.at(-1));
  if (!latest || now - latest.timestamp >= 30_000) {
    await db.access_logs.add({ threadId: thread.id, timestamp: now });
  }
}

export function cleanupExpiredLogs(now = Date.now()) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  return db.access_logs.toArray().then((logs) =>
    db.access_logs.bulkDelete(logs.filter((log) => log.timestamp < cutoff).map((log) => log.id))
  );
}
