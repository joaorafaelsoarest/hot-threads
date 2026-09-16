import { describe, expect, it } from 'vitest';
import { installPageBridge } from '../../src/content/page-bridge.js';
import { observeThreadRoute } from '../../src/content/route-observer.js';

const firstUrl = 'https://chat.google.com/app/chat/space-one/topic/thread-one';
const secondUrl = 'https://chat.google.com/app/chat/space-two/topic/thread-two';

function createPage(url) {
  const listeners = new Map();
  const location = { href: url };
  const page = {
    location,
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent(event) { listeners.get(event.type)?.forEach((listener) => listener(event)); },
    addEventListener(type, listener) {
      const current = listeners.get(type) ?? [];
      listeners.set(type, [...current, listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
    },
    history: {
      pushState(_state, _title, nextUrl) {
        location.href = new URL(nextUrl, location.href).href;
        return 'pushed';
      },
      replaceState(_state, _title, nextUrl) {
        location.href = new URL(nextUrl, location.href).href;
        return 'replaced';
      }
    }
  };
  return page;
}

describe('page bridge and route observer integration', () => {
  it('observes real bridge-wrapped pushState and replaceState, then restores both', () => {
    const page = createPage(firstUrl);
    const originalPushState = page.history.pushState;
    const originalReplaceState = page.history.replaceState;
    const routes = [];
    const cleanupBridge = installPageBridge(page);
    const cleanupObserver = observeThreadRoute((route) => routes.push(route), { window: page });

    page.history.pushState({}, '', secondUrl);
    page.history.replaceState({}, '', firstUrl);

    expect(routes.map((route) => route?.id)).toEqual([
      'space/space-one/topic/thread-one',
      'space/space-two/topic/thread-two',
      'space/space-one/topic/thread-one'
    ]);

    cleanupObserver();
    cleanupBridge();
    expect(page.history.pushState).toBe(originalPushState);
    expect(page.history.replaceState).toBe(originalReplaceState);
  });
});
