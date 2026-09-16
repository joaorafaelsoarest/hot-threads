import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { startContentScript } from '../../src/content/index.js';

const firstRoute = {
  id: 'space/space-one/topic/thread-one',
  url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
};
const secondRoute = {
  id: 'space/space-two/topic/thread-two',
  url: 'https://chat.google.com/app/chat/space-two/topic/thread-two'
};

function headerMarkup(label) {
  return `<header aria-label="${label}"><div><button type="button" aria-label="Open in full screen"></button></div></header>`;
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('startContentScript route/toggle race', () => {
  it('keeps the live new-route button unchanged when the old toggle resolves late', async () => {
    const dom = new JSDOM(`<!doctype html><html><head><title>Fallback</title></head><body>${headerMarkup('Route A')}</body></html>`, {
      url: firstRoute.url
    });
    const { window } = dom;
    const { document } = window;
    const messageTypes = [];
    let resolveToggle;
    let resolveSecondRead;

    const sendMessage = (message) => {
      messageTypes.push(message.type);
      if (message.type === 'GET_THREAD_STATE' && message.threadId === firstRoute.id) {
        return Promise.resolve({ ok: true, data: { isPinned: false } });
      }
      if (message.type === 'GET_THREAD_STATE' && message.threadId === secondRoute.id) {
        return new Promise((resolve) => { resolveSecondRead = resolve; });
      }
      if (message.type === 'TOGGLE_PIN') {
        return new Promise((resolve) => { resolveToggle = resolve; });
      }
      return Promise.resolve({ ok: true });
    };

    const cleanup = startContentScript({
      window,
      document,
      sendMessage,
      MutationObserver: undefined
    });

    try {
      await flushMicrotasks();
      const firstButton = document.querySelector('[data-hot-threads-pin]');
      expect(firstButton).not.toBeNull();
      expect(firstButton.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');

      firstButton.click();
      expect(resolveToggle).toEqual(expect.any(Function));

      const secondHeader = document.createElement('header');
      secondHeader.setAttribute('aria-label', 'Route B');
      const secondControls = document.createElement('div');
      const secondNativeButton = document.createElement('button');
      secondNativeButton.setAttribute('type', 'button');
      secondNativeButton.setAttribute('aria-label', 'Open in full screen');
      secondControls.append(secondNativeButton);
      secondHeader.append(secondControls);
      document.body.replaceChildren(secondHeader);

      window.history.pushState({}, '', secondRoute.url);
      await flushMicrotasks();

      const secondButton = secondHeader.querySelector('[data-hot-threads-pin]');
      expect(secondButton).not.toBeNull();
      expect(resolveSecondRead).toEqual(expect.any(Function));

      resolveSecondRead({ ok: true, data: { isPinned: false } });
      await flushMicrotasks();
      expect(secondButton.getAttribute('aria-pressed')).toBe('false');
      expect(secondButton.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
      expect(secondButton.disabled).toBe(false);

      resolveToggle({ ok: true, data: { isPinned: true } });
      await flushMicrotasks();
      expect(secondHeader.querySelector('[data-hot-threads-pin]')).toBe(secondButton);
      expect(secondButton.getAttribute('aria-pressed')).toBe('false');
      expect(secondButton.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
      expect(secondButton.disabled).toBe(false);
      expect(messageTypes.filter((type) => type === 'TOGGLE_PIN')).toHaveLength(1);
    } finally {
      cleanup();
      dom.window.close();
    }
  });
});
