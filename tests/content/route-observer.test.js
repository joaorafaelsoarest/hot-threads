import { describe, expect, it } from 'vitest';
import { observeThreadRoute } from '../../src/content/route-observer.js';

const initialUrl = 'https://chat.google.com/app/chat/space-one/topic/thread-one';
const replacementUrl = 'https://chat.google.com/app/chat/space-two/topic/thread-two';

function createWindow(url) {
  const listeners = new Map();
  const location = { href: url };
  const window = {
    location,
    history: {
      pushState(_state, _title, nextUrl) {
        if (nextUrl) location.href = new URL(nextUrl, location.href).href;
      },
      replaceState(_state, _title, nextUrl) {
        if (nextUrl) location.href = new URL(nextUrl, location.href).href;
      }
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type) {
      listeners.get(type)?.();
    }
  };
  return window;
}

describe('route observer', () => {
  it('emits the parsed route initially and after bridge/browser navigation events', () => {
    const window = createWindow(initialUrl);
    const routes = [];
    const cleanup = observeThreadRoute((route) => routes.push(route), { window });

    window.location.href = replacementUrl;
    window.dispatch('hot-threads:route-change');
    window.location.href = initialUrl;
    window.dispatch('hot-threads:route-change');
    window.dispatch('popstate');
    window.dispatch('hashchange');

    expect(routes.map((route) => route?.id)).toEqual([
      'space/space-one/topic/thread-one',
      'space/space-two/topic/thread-two',
      'space/space-one/topic/thread-one',
      'space/space-one/topic/thread-one',
      'space/space-one/topic/thread-one'
    ]);
    cleanup();
  });

  it('restores its history bridge and stops listening after cleanup', () => {
    const window = createWindow(initialUrl);
    const originalPushState = window.history.pushState;
    const routes = [];
    const cleanup = observeThreadRoute((route) => routes.push(route), { window });

    expect(window.history.pushState).not.toBe(originalPushState);
    cleanup();
    window.location.href = replacementUrl;
    window.dispatch('hot-threads:route-change');
    window.dispatch('popstate');

    expect(window.history.pushState).toBe(originalPushState);
    expect(routes.map((route) => route?.id)).toEqual(['space/space-one/topic/thread-one']);
  });
});
