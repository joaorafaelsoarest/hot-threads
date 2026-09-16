import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupExpiredLogs,
  db,
  getThreadState,
  recordAccess,
  togglePin,
  upsertThread
} from '../../src/background/db.js';

afterEach(async () => {
  await db.threads.clear();
  await db.access_logs.clear();
});

const thread = { id: 'thread-1', title: 'Hello', url: 'https://chat.google.com/room/1' };

describe('local thread database', () => {
  it('inserts and updates a thread', async () => {
    await upsertThread(thread);
    await upsertThread({ ...thread, title: 'Updated' });

    await expect(getThreadState(thread.id)).resolves.toMatchObject({ title: 'Updated', id: thread.id });
  });

  it('supports initial pin and unpin', async () => {
    await upsertThread({ ...thread, isPinned: true });
    await expect(getThreadState(thread.id)).resolves.toMatchObject({ isPinned: true });

    await togglePin(thread);
    await expect(getThreadState(thread.id)).resolves.toMatchObject({ isPinned: false, pinnedAt: null });
  });

  it('deduplicates access within 30 seconds', async () => {
    await recordAccess(thread, 100_000);
    await recordAccess(thread, 129_999);

    await expect(db.access_logs.count()).resolves.toBe(1);
  });

  it('records access after the debounce window', async () => {
    await recordAccess(thread, 100_000);
    await recordAccess(thread, 130_001);

    await expect(db.access_logs.count()).resolves.toBe(2);
  });

  it('uses the maximum timestamp when access logs are out of order', async () => {
    await db.access_logs.bulkAdd([
      { threadId: thread.id, timestamp: 100_000 },
      { threadId: thread.id, timestamp: 130_000 }
    ]);
    await recordAccess(thread, 150_000);

    await expect(db.access_logs.count()).resolves.toBe(2);
  });

  it('cleans only logs strictly older than 30 days', async () => {
    const cutoff = 30 * 24 * 60 * 60 * 1000;
    await recordAccess(thread, cutoff - 1);
    await recordAccess({ ...thread, id: 'thread-2' }, cutoff);
    await recordAccess({ ...thread, id: 'thread-3' }, cutoff);

    await cleanupExpiredLogs(cutoff * 2);
    await expect(db.access_logs.count()).resolves.toBe(2);
  });

  it('preserves every thread while removing only access logs older than the cutoff', async () => {
    const now = 31 * 24 * 60 * 60 * 1000;
    const cutoff = now - 30 * 24 * 60 * 60 * 1000;
    const oldThread = { ...thread, id: 'old-thread' };
    const boundaryThread = { ...thread, id: 'boundary-thread' };

    await upsertThread(oldThread);
    await upsertThread(boundaryThread);
    await db.access_logs.bulkAdd([
      { threadId: oldThread.id, timestamp: cutoff - 1 },
      { threadId: boundaryThread.id, timestamp: cutoff }
    ]);

    await cleanupExpiredLogs(now);

    await expect(db.threads.toArray()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: oldThread.id }),
      expect.objectContaining({ id: boundaryThread.id })
    ]));
    await expect(db.access_logs.toArray()).resolves.toEqual([
      expect.objectContaining({ threadId: boundaryThread.id, timestamp: cutoff })
    ]);
  });

  it('honors explicit unpinned fields when updating a pinned thread', async () => {
    await upsertThread({ ...thread, isPinned: true, pinnedAt: 123 });
    await upsertThread({ ...thread, isPinned: false, pinnedAt: null });

    await expect(getThreadState(thread.id)).resolves.toMatchObject({ isPinned: false, pinnedAt: null });
  });

  it('initially pins an unseen thread with a timestamp', async () => {
    const pinned = await togglePin(thread);

    expect(pinned.isPinned).toBe(true);
    expect(pinned.pinnedAt).toEqual(expect.any(Number));
  });
});
