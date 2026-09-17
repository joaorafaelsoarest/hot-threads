import { db } from './db.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TRENDING_WINDOW_MS = DAY_MS;
const STALE_WINDOW_MS = 14 * DAY_MS;

function latestAccessByThread(logs) {
  const latest = new Map();
  for (const log of logs) {
    const previous = latest.get(log.threadId);
    if (previous === undefined || log.timestamp > previous) {
      latest.set(log.threadId, log.timestamp);
    }
  }
  return latest;
}

function comparePinned(left, right) {
  return (right.pinnedAt ?? Number.NEGATIVE_INFINITY) - (left.pinnedAt ?? Number.NEGATIVE_INFINITY);
}

function compareTrending(left, right) {
  return right.accessCount - left.accessCount ||
    right.lastAccessAt - left.lastAccessAt ||
    left.title.localeCompare(right.title);
}

export function getDashboard(now = Date.now(), perf) {
  const operation = async () => {
    const [threads, logs] = await Promise.all([
      db.threads.toArray(),
      db.access_logs.toArray()
    ]);
    perf?.count('background.db.getDashboard.threadRowsRead', threads.length);
    perf?.count('background.db.getDashboard.logRowsRead', logs.length);
    const latestAccess = latestAccessByThread(logs);
    const staleCutoff = now - STALE_WINDOW_MS;
    const trendingCutoff = now - TRENDING_WINDOW_MS;
    const recentCounts = new Map();
    const recentAccess = new Map();

    for (const log of logs) {
      if (log.timestamp < trendingCutoff) continue;
      recentCounts.set(log.threadId, (recentCounts.get(log.threadId) || 0) + 1);
      const previous = recentAccess.get(log.threadId);
      if (previous === undefined || log.timestamp > previous) {
        recentAccess.set(log.threadId, log.timestamp);
      }
    }

    const pinned = threads
      .filter((thread) => thread.isPinned === true)
      .sort(comparePinned)
      .map((thread) => ({
        id: thread.id,
        title: thread.title,
        url: thread.url,
        isPinned: true,
        pinnedAt: thread.pinnedAt,
        stale: !logs.some((log) => log.threadId === thread.id && log.timestamp >= staleCutoff),
        lastAccessAt: latestAccess.get(thread.id) ?? null
      }));

    const trending = threads
      .filter((thread) => thread.isPinned !== true && recentCounts.has(thread.id))
      .map((thread) => ({
        id: thread.id,
        title: thread.title,
        url: thread.url,
        accessCount: recentCounts.get(thread.id),
        lastAccessAt: recentAccess.get(thread.id)
      }))
      .sort(compareTrending)
      .slice(0, 5);

    return { pinned, trending };
  };
  return perf ? perf.measureAsync('background.db.getDashboard', operation) : operation();
}

export async function unpinThread(threadId) {
  return db.transaction('rw', db.threads, async () => {
    const thread = await db.threads.get(threadId);
    if (!thread) return null;
    await db.threads.update(threadId, { isPinned: false, pinnedAt: null });
    return { ...thread, isPinned: false, pinnedAt: null };
  });
}
