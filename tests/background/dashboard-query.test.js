import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/background/db.js';
import { getDashboard, unpinThread } from '../../src/background/dashboard-query.js';

const NOW = 1_000_000_000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function thread(id, title, { isPinned = false, pinnedAt = null } = {}) {
  return {
    id,
    title,
    url: `https://chat.google.com/app/chat/space/topic/${id}`,
    isPinned,
    pinnedAt
  };
}

async function addLogs(entries) {
  await db.access_logs.bulkAdd(entries.flatMap(({ threadId, timestamps }) =>
    timestamps.map((timestamp) => ({ threadId, timestamp }))));
}

beforeEach(async () => {
  await db.threads.clear();
  await db.access_logs.clear();
});

afterEach(async () => {
  await db.threads.clear();
  await db.access_logs.clear();
});

describe('dashboard queries', () => {
  it('groups recent logs, includes the 24-hour boundary, and excludes pinned threads', async () => {
    await db.threads.bulkPut([
      thread('boundary', 'Boundary'),
      thread('pinned', 'Pinned', { isPinned: true, pinnedAt: 10 }),
      thread('old', 'Old')
    ]);
    await addLogs([
      { threadId: 'boundary', timestamps: [NOW - DAY] },
      { threadId: 'pinned', timestamps: [NOW - 1, NOW - 2, NOW - 3] },
      { threadId: 'old', timestamps: [NOW - DAY - 1] }
    ]);

    await expect(getDashboard(NOW)).resolves.toEqual({
      pinned: [{
        id: 'pinned',
        title: 'Pinned',
        url: 'https://chat.google.com/app/chat/space/topic/pinned',
        isPinned: true,
        pinnedAt: 10,
        stale: false,
        lastAccessAt: NOW - 1
      }],
      trending: [{
        id: 'boundary',
        title: 'Boundary',
        url: 'https://chat.google.com/app/chat/space/topic/boundary',
        accessCount: 1,
        lastAccessAt: NOW - DAY
      }]
    });
  });

  it('sorts trending by count, last access, and title, then limits to five rows', async () => {
    await db.threads.bulkPut([
      thread('many', 'Many'),
      thread('alpha', 'Alpha'),
      thread('zulu', 'Zulu'),
      thread('beta', 'Beta'),
      thread('delta', 'Delta'),
      thread('epsilon', 'Epsilon'),
      thread('old', 'Old')
    ]);
    await addLogs([
      { threadId: 'many', timestamps: [NOW - 300, NOW - 200, NOW - 100] },
      { threadId: 'alpha', timestamps: [NOW - 200, NOW - 100] },
      { threadId: 'zulu', timestamps: [NOW - 250, NOW - 100] },
      { threadId: 'beta', timestamps: [NOW - 10] },
      { threadId: 'delta', timestamps: [NOW - 20] },
      { threadId: 'epsilon', timestamps: [NOW - 20] },
      { threadId: 'old', timestamps: [NOW - DAY - 1] }
    ]);

    const dashboard = await getDashboard(NOW);

    expect(dashboard.trending).toEqual([
      {
        id: 'many',
        title: 'Many',
        url: 'https://chat.google.com/app/chat/space/topic/many',
        accessCount: 3,
        lastAccessAt: NOW - 100
      },
      {
        id: 'alpha',
        title: 'Alpha',
        url: 'https://chat.google.com/app/chat/space/topic/alpha',
        accessCount: 2,
        lastAccessAt: NOW - 100
      },
      {
        id: 'zulu',
        title: 'Zulu',
        url: 'https://chat.google.com/app/chat/space/topic/zulu',
        accessCount: 2,
        lastAccessAt: NOW - 100
      },
      {
        id: 'beta',
        title: 'Beta',
        url: 'https://chat.google.com/app/chat/space/topic/beta',
        accessCount: 1,
        lastAccessAt: NOW - 10
      },
      {
        id: 'delta',
        title: 'Delta',
        url: 'https://chat.google.com/app/chat/space/topic/delta',
        accessCount: 1,
        lastAccessAt: NOW - 20
      }
    ]);
    expect(dashboard.trending).toHaveLength(5);
    expect(dashboard.trending.some(({ id }) => id === 'old')).toBe(false);
    expect(dashboard.trending.some(({ id }) => id === 'epsilon')).toBe(false);
  });

  it('sorts pinned rows by pinnedAt and marks recent-boundary, old, and no-log rows correctly', async () => {
    await db.threads.bulkPut([
      thread('old-pinned', 'Old pinned', { isPinned: true, pinnedAt: 100 }),
      thread('boundary-pinned', 'Boundary pinned', { isPinned: true, pinnedAt: 200 }),
      thread('new-pinned', 'New pinned', { isPinned: true, pinnedAt: 300 })
    ]);
    await addLogs([
      { threadId: 'old-pinned', timestamps: [NOW - 14 * DAY - 1] },
      { threadId: 'boundary-pinned', timestamps: [NOW - 14 * DAY] }
    ]);

    await expect(getDashboard(NOW)).resolves.toMatchObject({
      pinned: [
        {
          id: 'new-pinned',
          title: 'New pinned',
          url: 'https://chat.google.com/app/chat/space/topic/new-pinned',
          isPinned: true,
          pinnedAt: 300,
          stale: true,
          lastAccessAt: null
        },
        {
          id: 'boundary-pinned',
          title: 'Boundary pinned',
          url: 'https://chat.google.com/app/chat/space/topic/boundary-pinned',
          isPinned: true,
          pinnedAt: 200,
          stale: false,
          lastAccessAt: NOW - 14 * DAY
        },
        {
          id: 'old-pinned',
          title: 'Old pinned',
          url: 'https://chat.google.com/app/chat/space/topic/old-pinned',
          isPinned: true,
          pinnedAt: 100,
          stale: true,
          lastAccessAt: NOW - 14 * DAY - 1
        }
      ]
    });
  });

  it('unpins only the thread pin fields while retaining the thread and its logs', async () => {
    await db.threads.put({
      ...thread('keep', 'Keep me', { isPinned: true, pinnedAt: 123 }),
      spaceId: 'space',
      threadId: 'keep'
    });
    await db.access_logs.add({ threadId: 'keep', timestamp: NOW });

    await expect(unpinThread('keep')).resolves.toMatchObject({
      id: 'keep',
      title: 'Keep me',
      isPinned: false,
      pinnedAt: null,
      spaceId: 'space',
      threadId: 'keep'
    });
    await expect(db.threads.get('keep')).resolves.toMatchObject({
      id: 'keep',
      title: 'Keep me',
      isPinned: false,
      pinnedAt: null,
      spaceId: 'space',
      threadId: 'keep'
    });
    await expect(db.access_logs.where('threadId').equals('keep').count()).resolves.toBe(1);
  });
});
