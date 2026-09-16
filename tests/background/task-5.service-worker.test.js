import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/background/db.js';
import {
  GET_DASHBOARD,
  OPEN_THREAD,
  UNPIN_THREAD
} from '../../src/shared/protocol.js';

const DAY = 24 * 60 * 60 * 1000;

function createChromeFixture() {
  const listeners = {
    installed: null,
    message: null,
    startup: null,
    updated: null
  };

  return {
    listeners,
    chrome: {
      runtime: {
        onInstalled: { addListener(listener) { listeners.installed = listener; } },
        onMessage: { addListener(listener) { listeners.message = listener; } },
        onStartup: { addListener(listener) { listeners.startup = listener; } }
      },
      tabs: {
        onUpdated: { addListener(listener) { listeners.updated = listener; } },
        update: vi.fn().mockResolvedValue({ id: 7 })
      }
    }
  };
}

function sendMessage(listener, message, sender = { tab: { id: 7, url: 'https://chat.google.com/' } }) {
  return new Promise((resolve) => {
    expect(listener(message, sender, resolve)).toBe(true);
  });
}

beforeEach(async () => {
  await db.threads.clear();
  await db.access_logs.clear();
});

afterEach(async () => {
  await db.threads.clear();
  await db.access_logs.clear();
  delete globalThis.chrome;
  vi.restoreAllMocks();
});

describe('Task 5 dashboard Service Worker messages', () => {
  let fixture;

  beforeEach(async () => {
    fixture = createChromeFixture();
    globalThis.chrome = fixture.chrome;
    vi.resetModules();
    await import('../../src/background/index.js');
  });

  it('cleans expired logs before returning the local dashboard for a valid sender tab', async () => {
    const now = Date.now();
    await db.threads.put({
      id: 'pinned',
      title: 'Pinned',
      url: 'https://chat.google.com/app/chat/space/topic/pinned',
      isPinned: true,
      pinnedAt: now
    });
    await db.access_logs.bulkAdd([
      { threadId: 'pinned', timestamp: now },
      { threadId: 'expired', timestamp: now - 30 * DAY - 1 }
    ]);

    const response = await sendMessage(fixture.listeners.message, { type: GET_DASHBOARD });

    expect(response).toEqual({
      ok: true,
      data: {
        pinned: [{
          id: 'pinned',
          title: 'Pinned',
          url: 'https://chat.google.com/app/chat/space/topic/pinned',
          isPinned: true,
          pinnedAt: now,
          stale: false,
          lastAccessAt: now
        }],
        trending: []
      }
    });
    await expect(db.access_logs.toArray()).resolves.toHaveLength(1);
  });

  it('keeps the thread row through install and startup retention cleanup', async () => {
    const now = Date.now();
    const threadId = 'surviving-thread';
    await db.threads.put({
      id: threadId,
      title: 'Surviving thread',
      url: 'https://chat.google.com/app/chat/space/topic/surviving-thread',
      isPinned: false,
      pinnedAt: null
    });
    await db.access_logs.add({ threadId, timestamp: now - 30 * DAY - 1 });

    await fixture.listeners.installed();
    await expect(db.threads.get(threadId)).resolves.toMatchObject({ id: threadId });
    await expect(db.access_logs.where('threadId').equals(threadId).count()).resolves.toBe(0);

    await db.access_logs.add({ threadId, timestamp: now - 30 * DAY - 1 });
    await fixture.listeners.startup();
    await expect(db.threads.get(threadId)).resolves.toMatchObject({ id: threadId });
    await expect(db.access_logs.where('threadId').equals(threadId).count()).resolves.toBe(0);
  });

  it('keeps the exact-boundary access log and thread when Dashboard opens', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const threadId = 'boundary-thread';
    await db.threads.put({
      id: threadId,
      title: 'Boundary thread',
      url: 'https://chat.google.com/app/chat/space/topic/boundary-thread',
      isPinned: true,
      pinnedAt: now
    });
    await db.access_logs.add({ threadId, timestamp: now - 30 * DAY });

    const response = await sendMessage(fixture.listeners.message, { type: GET_DASHBOARD });

    expect(response.ok).toBe(true);
    await expect(db.threads.get(threadId)).resolves.toMatchObject({ id: threadId });
    await expect(db.access_logs.where('threadId').equals(threadId).count()).resolves.toBe(1);
  });

  it('rejects dashboard actions when sender.tab is missing or invalid', async () => {
    await expect(sendMessage(fixture.listeners.message, { type: GET_DASHBOARD }, {})).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_SENDER', message: 'Sender tab is required' }
    });
    await expect(sendMessage(fixture.listeners.message, { type: UNPIN_THREAD, threadId: 'thread' }, {
      tab: { id: '7' }
    })).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_SENDER', message: 'Sender tab is required' }
    });
  });

  it('handles direct unpin without deleting the thread or logs', async () => {
    await db.threads.put({
      id: 'thread',
      title: 'Thread',
      url: 'https://chat.google.com/app/chat/space/topic/thread',
      isPinned: true,
      pinnedAt: 123
    });
    await db.access_logs.add({ threadId: 'thread', timestamp: Date.now() });

    await expect(sendMessage(fixture.listeners.message, {
      type: UNPIN_THREAD,
      threadId: 'thread'
    })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ id: 'thread', isPinned: false, pinnedAt: null })
    });
    await expect(db.threads.get('thread')).resolves.toMatchObject({ isPinned: false, pinnedAt: null });
    await expect(db.access_logs.where('threadId').equals('thread').count()).resolves.toBe(1);
  });

  it.each([
    'https://chat.google.com/app/chat/space/topic/thread',
    'https://mail.google.com/chat/#chat/space/space/topic/thread'
  ])('navigates to an allowed thread URL: %s', async (url) => {
    await expect(sendMessage(fixture.listeners.message, { type: OPEN_THREAD, url })).resolves.toEqual({
      ok: true,
      data: { url }
    });
    expect(fixture.chrome.tabs.update).toHaveBeenCalledWith(7, { url });
  });

  it.each([
    'https://example.com/app/chat/space/topic/thread',
    'https://chat.google.com/',
    'https://mail.google.com/chat/#chat/space/space/topic'
  ])('rejects an invalid thread navigation URL: %s', async (url) => {
    await expect(sendMessage(fixture.listeners.message, { type: OPEN_THREAD, url })).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_THREAD_URL', message: 'URL must be a valid Chat or Gmail thread URL' }
    });
    expect(fixture.chrome.tabs.update).not.toHaveBeenCalled();
  });
});
