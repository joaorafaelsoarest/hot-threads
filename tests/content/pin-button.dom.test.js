// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createPinButtonReconciler } from '../../src/content/pin-button.js';

const route = {
  id: 'space/space-one/topic/thread-one',
  spaceId: 'space-one',
  threadId: 'thread-one',
  url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
};

describe('pin button in a real DOM', () => {
  it('creates namespaced SVG controls that can focus and activate from the keyboard', async () => {
    const dom = new JSDOM('<header aria-label="Real thread"><div><button aria-label="Open in full screen"></button></div></header>');
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document: dom.window.document,
      MutationObserver: undefined,
      sendMessage: async (message) => {
        messages.push(message.type);
        return { ok: true, data: { isPinned: message.type === 'TOGGLE_PIN' } };
      }
    });

    await reconciler.reconcile(route);
    const button = dom.window.document.querySelector('[data-hot-threads-pin]');
    const path = button.querySelector('path');
    button.focus();
    button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(dom.window.document.activeElement).toBe(button);
    expect(button.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    const icon = button.querySelector('svg');
    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('width')).toBe('20');
    expect(icon.getAttribute('height')).toBe('20');
    expect(path.getAttribute('fill')).toBe('currentColor');
    expect(path.getAttribute('stroke')).toBeNull();
    expect(messages).toEqual(['GET_THREAD_STATE', 'TOGGLE_PIN']);
  });
});
