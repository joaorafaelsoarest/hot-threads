import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../src/background/db.js';
import { SYNC_THREAD, TOGGLE_PIN } from '../../src/shared/protocol.js';

function createChromeFixture() {
  const listeners = {};
  const event = (name) => ({ addListener(listener) { listeners[name] = listener; } });

  return {
    listeners,
    chrome: {
      runtime: {
        onInstalled: event('installed'),
        onMessage: event('message'),
        onStartup: event('startup')
      },
      tabs: { onUpdated: event('updated') }
    }
  };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    expect(listener(message, {}, resolve)).toBe(true);
  });
}

describe('SYNC_THREAD access tracking', () => {
  let fixture;

  beforeEach(async () => {
    fixture = createChromeFixture();
    globalThis.chrome = fixture.chrome;
    vi.resetModules();
    await import('../../src/background/index.js');
  });

  afterEach(async () => {
    await db.threads.clear();
    await db.access_logs.clear();
    delete globalThis.chrome;
  });

  it('records one debounced access when a thread is synced repeatedly', async () => {
    const thread = {
      id: 'space/space-one/topic/thread-one',
      spaceId: 'space-one',
      threadId: 'thread-one',
      title: 'Thread one',
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
    };

    await sendMessage(fixture.listeners.message, { type: SYNC_THREAD, thread });
    await sendMessage(fixture.listeners.message, { type: SYNC_THREAD, thread });

    await expect(db.access_logs.count()).resolves.toBe(1);
  });

  it.each([
    { id: 'space/space-one/topic/thread-one', spaceId: 'space-one', threadId: 'thread-one', title: 'Thread', url: 'https://example.com/thread' },
    { id: 'space/space-one/topic/thread-one', spaceId: 'space-one', threadId: '', title: 'Thread', url: 'https://chat.google.com/app/chat/space-one/topic/thread-one' },
    { id: 'space/other/topic/thread-one', spaceId: 'space-one', threadId: 'thread-one', title: 'Thread', url: 'https://chat.google.com/app/chat/space-one/topic/thread-one' },
    { id: 'space/space-one/topic/thread-one', spaceId: 'other-space', threadId: 'thread-one', title: 'Thread', url: 'https://chat.google.com/app/chat/space-one/topic/thread-one' },
    { id: 'space/space-one/topic/thread-one', spaceId: 'space-one', threadId: 'thread-one', title: {}, url: 'https://chat.google.com/app/chat/space-one/topic/thread-one' }
  ])('rejects a malformed thread message', async (thread) => {
    await expect(sendMessage(fixture.listeners.message, { type: SYNC_THREAD, thread })).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_THREAD', message: 'Thread must contain a valid matching Chat URL' }
    });
  });

  it('normalizes parsed fields and an empty title before syncing or pinning', async () => {
    const thread = {
      id: 'space/space-one/topic/thread-one',
      spaceId: 'space-one',
      threadId: 'thread-one',
      title: '',
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one',
      unexpected: 'discarded'
    };

    await expect(sendMessage(fixture.listeners.message, { type: SYNC_THREAD, thread })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        id: thread.id,
        spaceId: 'space-one',
        threadId: 'thread-one',
        title: 'Thread thread-one'
      })
    });
    await expect(sendMessage(fixture.listeners.message, { type: TOGGLE_PIN, thread })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({
        id: thread.id,
        spaceId: 'space-one',
        threadId: 'thread-one',
        title: 'Thread thread-one',
        isPinned: true
      })
    });
    await expect(db.threads.get(thread.id)).resolves.not.toHaveProperty('unexpected');
  });

  it('contains a rejected tab tracking operation', async () => {
    vi.resetModules();
    vi.doMock('../../src/background/db.js', async (importActual) => ({
      ...await importActual(),
      upsertThread: vi.fn().mockRejectedValue(new Error('database unavailable'))
    }));
    await import('../../src/background/index.js');

    await expect(fixture.listeners.updated(1, {
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
    }, { title: 'Thread' })).resolves.toBeUndefined();
    vi.doUnmock('../../src/background/db.js');
  });

  it('contains rejected install and startup cleanup operations', async () => {
    vi.resetModules();
    vi.doMock('../../src/background/db.js', async (importActual) => ({
      ...await importActual(),
      cleanupExpiredLogs: vi.fn().mockRejectedValue(new Error('database unavailable'))
    }));
    await import('../../src/background/index.js');

    await expect(fixture.listeners.installed()).resolves.toBeUndefined();
    await expect(fixture.listeners.startup()).resolves.toBeUndefined();
    vi.doUnmock('../../src/background/db.js');
  });
});
