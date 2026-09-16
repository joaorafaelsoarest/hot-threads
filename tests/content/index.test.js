import { describe, expect, it } from 'vitest';
import { startContentScript } from '../../src/content/index.js';
import { GET_THREAD_STATE, SYNC_THREAD } from '../../src/shared/protocol.js';

function createWindow(url) {
  const listeners = new Map();
  const location = { href: url };
  return {
    location,
    history: {
      pushState(_state, _title, nextUrl) {
        location.href = new URL(nextUrl, location.href).href;
      },
      replaceState() {}
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    dispatch(type) { listeners.get(type)?.(); }
  };
}

function createDocument() {
  const controls = { children: [], append(child) { this.children.push(child); child.parentElement = this; }, querySelector() { return null; } };
  const nativeButton = { parentElement: controls };
  const header = {
    getAttribute(name) { return name === 'aria-label' ? 'Semantic thread title' : null; },
    querySelector(selector) { return selector.includes('Open in full screen') ? nativeButton : null; }
  };
  return {
    title: 'Document title',
    documentElement: {},
    querySelectorAll(selector) { return selector === 'header[aria-label]' ? [header] : []; },
    createElementNS() {
      return {
        attributes: new Map(),
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        append() {},
        addEventListener() {}
      };
    }
  };
}

describe('content entrypoint', () => {
  it('syncs the initial and each SPA route with the semantic header title', async () => {
    const window = createWindow('https://chat.google.com/app/chat/space-one/topic/thread-one');
    const document = createDocument();
    const messages = [];
    const stop = startContentScript({
      window,
      document,
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve(message.type === GET_THREAD_STATE ? { ok: true, data: null } : { ok: true, data: {} });
      }
    });

    window.location.href = 'https://chat.google.com/app/chat/space-two/topic/thread-two';
    window.dispatch('hot-threads:route-change');
    await Promise.resolve();

    expect(messages.filter((message) => message.type === SYNC_THREAD)).toEqual([
      {
        type: SYNC_THREAD,
        thread: {
          id: 'space/space-one/topic/thread-one',
          spaceId: 'space-one',
          threadId: 'thread-one',
          url: 'https://chat.google.com/app/chat/space-one/topic/thread-one',
          title: 'Semantic thread title'
        }
      },
      {
        type: SYNC_THREAD,
        thread: {
          id: 'space/space-two/topic/thread-two',
          spaceId: 'space-two',
          threadId: 'thread-two',
          url: 'https://chat.google.com/app/chat/space-two/topic/thread-two',
          title: 'Semantic thread title'
        }
      }
    ]);
    stop();
  });

  it('falls back from a missing header title to document title then thread ID', async () => {
    const window = createWindow('https://chat.google.com/app/chat/space-one/topic/thread-one');
    const messages = [];
    const document = {
      title: 'Document fallback',
      documentElement: {},
      querySelectorAll() { return []; },
      createElementNS() { return {}; }
    };
    const stop = startContentScript({
      window,
      document,
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve({ ok: true, data: null });
      }
    });

    expect(messages.find((message) => message.type === SYNC_THREAD).thread.title).toBe('Document fallback');
    stop();
  });

  it('uses the thread ID title fallback when no semantic or document title exists', () => {
    const window = createWindow('https://chat.google.com/app/chat/space-one/topic/thread-one');
    const messages = [];
    const stop = startContentScript({
      window,
      document: { title: '', documentElement: {}, querySelectorAll() { return []; } },
      sendMessage(message) {
        messages.push(message);
        return Promise.resolve({ ok: true, data: null });
      }
    });

    expect(messages.find((message) => message.type === SYNC_THREAD).thread.title).toBe('Thread thread-one');
    stop();
  });
});
