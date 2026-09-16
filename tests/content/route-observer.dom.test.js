// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { installPageBridge } from '../../src/content/history-bridge.js';
import { observeThreadRoute } from '../../src/content/route-observer.js';

const firstUrl = 'https://chat.google.com/app/chat/space-one/topic/thread-one';
const secondUrl = 'https://chat.google.com/app/chat/space-two/topic/thread-two';

describe('real bridge and route observer integration', () => {
  it('observes actual history URL mutations and restores methods during cleanup', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: firstUrl });
    const page = dom.window;
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
