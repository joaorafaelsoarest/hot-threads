import { describe, expect, it } from 'vitest';
import { installPageBridge, ROUTE_CHANGE_EVENT } from '../../src/content/page-bridge.js';

function createPage() {
  const events = [];
  const page = {
    CustomEvent: class { constructor(type) { this.type = type; } },
    dispatchEvent(event) { events.push(event.type); },
    history: {
      pushState() { return 'pushed'; },
      replaceState() { return 'replaced'; }
    }
  };
  return { page, events };
}

describe('page route bridge', () => {
  it('dispatches one route event after successful pushState and replaceState without double wrapping', () => {
    const { page, events } = createPage();
    installPageBridge(page);
    installPageBridge(page);

    expect(page.history.pushState()).toBe('pushed');
    expect(page.history.replaceState()).toBe('replaced');
    expect(events).toEqual([ROUTE_CHANGE_EVENT, ROUTE_CHANGE_EVENT]);
  });

  it('restores page history and clears its marker during cleanup', () => {
    const { page, events } = createPage();
    const originalPushState = page.history.pushState;
    const originalReplaceState = page.history.replaceState;
    const cleanup = installPageBridge(page);

    cleanup();
    expect(page.history.pushState).toBe(originalPushState);
    expect(page.history.replaceState).toBe(originalReplaceState);
    page.history.pushState();
    expect(events).toEqual([]);

    installPageBridge(page);
    page.history.pushState();
    expect(events).toEqual([ROUTE_CHANGE_EVENT]);
  });
});
