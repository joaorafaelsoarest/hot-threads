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

export function recordAccess(thread, now = Date.now(), perf) {
  const operation = async () => {
    await upsertThread(thread);
    const logs = await db.access_logs.where('threadId').equals(thread.id).sortBy('timestamp');
    perf?.count('background.db.recordAccess.logRowsRead', logs.length);
    const latest = logs.at(-1);
    if (!latest || now - latest.timestamp >= 30_000) {
      await db.access_logs.add({ threadId: thread.id, timestamp: now });
    }
  };
  return perf ? perf.measureAsync('background.db.recordAccess', operation) : operation();
}

export function cleanupExpiredLogs(now = Date.now(), perf) {
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const operation = () => db.access_logs.toArray().then((logs) => {
    const expiredIds = logs.filter((log) => log.timestamp < cutoff).map((log) => log.id);
    perf?.count('background.db.cleanupExpiredLogs.rowsScanned', logs.length);
    perf?.count('background.db.cleanupExpiredLogs.rowsDeleted', expiredIds.length);
    return db.access_logs.bulkDelete(expiredIds);
  });
  return perf ? perf.measureAsync('background.db.cleanupExpiredLogs', operation) : operation();
}
