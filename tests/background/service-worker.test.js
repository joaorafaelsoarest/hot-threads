import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getThreadState } from '../../src/background/db.js';
import { GET_THREAD_STATE, SYNC_THREAD, TOGGLE_PIN } from '../../src/shared/protocol.js';

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
        onUpdated: { addListener(listener) { listeners.updated = listener; } }
      }
    }
  };
}

async function sendMessage(listener, message) {
  return new Promise((resolve) => {
    const keepChannelOpen = listener(message, {}, resolve);
    expect(keepChannelOpen).toBe(true);
  });
}

describe('background service worker', () => {
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

  it('tracks a thread URL from onUpdated and falls back to tab.url', async () => {
    await fixture.listeners.updated(1, {
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
    }, { title: 'Changed URL', url: 'https://chat.google.com/' });
    await fixture.listeners.updated(2, {}, {
      title: 'Fallback URL',
      url: 'https://mail.google.com/chat/#chat/space/space-two/topic/thread-two'
    });

    await expect(getThreadState('space/space-one/topic/thread-one')).resolves.toMatchObject({
      title: 'Changed URL',
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
    });
    await expect(getThreadState('space/space-two/topic/thread-two')).resolves.toMatchObject({
      title: 'Fallback URL',
      url: 'https://mail.google.com/chat/#chat/space/space-two/topic/thread-two'
    });
    await expect(db.access_logs.count()).resolves.toBe(2);
  });

  it('returns serializable errors for unknown and malformed messages', async () => {
    await expect(sendMessage(fixture.listeners.message, { type: 'UNKNOWN' })).resolves.toEqual({
      ok: false,
      error: { code: 'UNKNOWN_MESSAGE', message: 'Unknown message type' }
    });
    await expect(sendMessage(fixture.listeners.message, null)).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_MESSAGE', message: 'Message must be an object' }
    });
  });

  it('syncs, reads, and toggles a thread through protocol messages', async () => {
    const thread = {
      id: 'space/space-one/topic/thread-one',
      spaceId: 'space-one',
      threadId: 'thread-one',
      title: 'Thread one',
      url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
    };

    await expect(sendMessage(fixture.listeners.message, { type: SYNC_THREAD, thread })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ id: thread.id, title: 'Thread one' })
    });
    await expect(sendMessage(fixture.listeners.message, { type: GET_THREAD_STATE, threadId: thread.id })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ id: thread.id, isPinned: false })
    });
    await expect(sendMessage(fixture.listeners.message, { type: TOGGLE_PIN, thread })).resolves.toEqual({
      ok: true,
      data: expect.objectContaining({ id: thread.id, isPinned: true })
    });
  });

  it('rejects empty state IDs and returns explicit null for an unknown ID', async () => {
    await expect(sendMessage(fixture.listeners.message, { type: GET_THREAD_STATE, threadId: '' })).resolves.toEqual({
      ok: false,
      error: { code: 'INVALID_MESSAGE', message: 'Thread ID is required' }
    });
    await expect(sendMessage(fixture.listeners.message, {
      type: GET_THREAD_STATE,
      threadId: 'space/unknown/topic/thread'
    })).resolves.toEqual({ ok: true, data: null });
  });
});
