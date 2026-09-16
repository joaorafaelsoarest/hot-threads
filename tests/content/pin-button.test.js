import { describe, expect, it } from 'vitest';
import { createPinButtonReconciler } from '../../src/content/pin-button.js';

const route = {
  id: 'space/space-one/topic/thread-one',
  spaceId: 'space-one',
  threadId: 'thread-one',
  url: 'https://chat.google.com/app/chat/space-one/topic/thread-one'
};

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(child) { child.parentElement = this; this.children.push(child); }
  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    }
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  dispatch(type, event = {}) { return this.listeners.get(type)?.({ preventDefault() {}, ...event }); }
  querySelector(selector) {
    if (selector === '[data-hot-threads-pin]') {
      return this.children.find((child) => child.getAttribute('data-hot-threads-pin') !== null) ?? null;
    }
    if (selector === 'path') {
      return this.children.flatMap((child) => child.children ?? []).find((child) => child.tagName === 'path') ?? null;
    }
    if (selector.includes('button[aria-label^="Open in full screen"]')) return this.nativeButton;
    if (selector.includes('button[aria-label^="Close "]')) return null;
    return null;
  }
}

function createDocument({ header = true, title = 'Document fallback' } = {}) {
  const staleHeaders = [];
  function makeHeader() {
    const threadHeader = new FakeElement('header');
    threadHeader.setAttribute('aria-label', 'Header title');
    threadHeader.nativeButton = new FakeElement('button');
    const controls = new FakeElement('div');
    controls.append(threadHeader.nativeButton);
    threadHeader.nativeButton.parentElement = controls;
    return threadHeader;
  }
  let threadHeader = header ? makeHeader() : null;
  const document = {
    title,
    documentElement: new FakeElement('html'),
    createElementNS(_namespace, tagName) { return new FakeElement(tagName); },
    querySelectorAll(selector) {
      if (selector === 'header[aria-label]') return threadHeader ? [threadHeader] : [];
      if (selector === '[data-hot-threads-pin]') {
        return [threadHeader, ...staleHeaders].filter(Boolean).flatMap((header) =>
          header.nativeButton.parentElement.children.filter((child) => child.getAttribute('data-hot-threads-pin') !== null)
        );
      }
      return [];
    },
    get header() { return threadHeader; },
    replaceHeader() {
      staleHeaders.push(threadHeader);
      threadHeader = makeHeader();
      return threadHeader;
    }
  };
  return document;
}

describe('pin button reconciliation', () => {
  it('keeps one button after repeated reconciliation and reflects successful state', async () => {
    const document = createDocument();
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage: async (message) => {
        messages.push(message);
        return message.type === 'GET_THREAD_STATE'
          ? { ok: true, data: { isPinned: false } }
          : { ok: true, data: { isPinned: true } };
      }
    });

    await reconciler.reconcile(route);
    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');

    expect(document.header.nativeButton.parentElement.children.filter((child) => child.getAttribute('data-hot-threads-pin') !== null)).toHaveLength(1);
    expect(button.getAttribute('aria-label')).toBe('Fixar thread');
    expect(button.getAttribute('title')).toBe('Fixar thread');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('fill')).toBe('currentColor');
    expect(messages.filter((message) => message.type === 'GET_THREAD_STATE')).toHaveLength(2);

    await button.dispatch('click');

    expect(messages.at(-1)).toMatchObject({ type: 'TOGGLE_PIN', thread: { ...route, title: 'Header title' } });
    expect(button.getAttribute('aria-label')).toBe('Desfixar thread');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing when the header anchor is absent', async () => {
    const document = createDocument({ header: false });
    const sendMessage = async () => ({ ok: true, data: { isPinned: false } });
    const reconciler = createPinButtonReconciler({ document, sendMessage });

    await expect(reconciler.reconcile(route)).resolves.toBeNull();
  });

  it('removes the pin marker when the route is no longer a thread', async () => {
    const document = createDocument();
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage: async () => ({ ok: true, data: { isPinned: false } })
    });

    await reconciler.reconcile(route);
    await reconciler.reconcile(null);

    expect(document.querySelectorAll('[data-hot-threads-pin]')).toHaveLength(0);
  });

  it('does not refresh state for a small mutation batch once the button is ready', async () => {
    const document = createDocument();
    let mutationObserver;
    class FakeMutationObserver {
      constructor(callback) { this.callback = callback; mutationObserver = this; }
      observe(_target, options) { this.options = options; }
      disconnect() {}
      trigger() { this.callback(); }
    }
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document,
      MutationObserver: FakeMutationObserver,
      sendMessage: async (message) => {
        messages.push(message);
        return { ok: true, data: { isPinned: false } };
      }
    });

    await reconciler.reconcile(route);
    reconciler.start();
    mutationObserver.trigger();
    mutationObserver.trigger();
    mutationObserver.trigger();
    await Promise.resolve();
    await Promise.resolve();

    expect(mutationObserver.options).toEqual({
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label']
    });
    expect(messages.filter((message) => message.type === 'GET_THREAD_STATE')).toHaveLength(1);
  });

  it('does not issue repeated state reads during sustained ready-state mutations', async () => {
    const document = createDocument();
    let observer;
    class FakeMutationObserver {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() {}
      trigger() { this.callback(); }
    }
    let reads = 0;
    const reconciler = createPinButtonReconciler({
      document,
      MutationObserver: FakeMutationObserver,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') reads += 1;
        return Promise.resolve({ ok: true, data: { isPinned: false } });
      }
    });

    reconciler.start();
    await reconciler.reconcile(route);
    for (let index = 0; index < 20; index += 1) observer.trigger();
    await Promise.resolve();
    await Promise.resolve();

    expect(reads).toBe(1);
  });

  it('keeps a completed toggle state when an earlier state read resolves late', async () => {
    const document = createDocument();
    let resolveLateRead;
    let readCount = 0;
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') {
          readCount += 1;
          return readCount === 1
            ? Promise.resolve({ ok: true, data: { isPinned: false } })
            : new Promise((resolve) => { resolveLateRead = resolve; });
        }
        return Promise.resolve({ ok: true, data: { isPinned: true } });
      }
    });

    await reconciler.reconcile(route);
    const staleRead = reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    await button.dispatch('click');
    resolveLateRead({ ok: true, data: { isPinned: false } });
    await staleRead;

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.disabled).toBe(false);
  });

  it('defers a new state read until a pending toggle completes', async () => {
    const document = createDocument();
    let resolveToggle;
    let resolveRefresh;
    let reads = 0;
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') {
          reads += 1;
          return reads === 1
            ? Promise.resolve({ ok: true, data: { isPinned: false } })
            : new Promise((resolve) => { resolveRefresh = resolve; });
        }
        return new Promise((resolve) => { resolveToggle = resolve; });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    const toggle = button.dispatch('click');
    const deferredReconcile = reconciler.reconcile(route);

    expect(reads).toBe(1);
    resolveToggle({ ok: true, data: { isPinned: true } });
    await toggle;
    await Promise.resolve();
    expect(reads).toBe(2);
    resolveRefresh({ ok: true, data: { isPinned: true } });
    await deferredReconcile;
  });

  it('serializes rapid click and keyboard activation while a toggle is pending', async () => {
    const document = createDocument();
    let resolveToggle;
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        messages.push(message);
        return message.type === 'GET_THREAD_STATE'
          ? Promise.resolve({ ok: true, data: { isPinned: false } })
          : new Promise((resolve) => { resolveToggle = resolve; });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    button.dispatch('click');
    button.dispatch('click');
    button.dispatch('keydown', { key: 'Enter' });

    expect(messages.filter((message) => message.type === 'TOGGLE_PIN')).toHaveLength(1);
    expect(button.disabled).toBe(true);
    resolveToggle({ ok: true, data: { isPinned: true } });
    await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('preserves a pinned visual state while a toggle is pending or rejected', async () => {
    const document = createDocument();
    let rejectToggle;
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') return Promise.resolve({ ok: true, data: { isPinned: true } });
        return new Promise((_resolve, reject) => { rejectToggle = reject; });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    const toggle = button.dispatch('click');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('pinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('currentColor');

    rejectToggle(new Error('closed'));
    await toggle;
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('pinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('currentColor');
  });

  it('preserves an unpinned visual state while a toggle is pending or rejected', async () => {
    const document = createDocument();
    let rejectToggle;
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') return Promise.resolve({ ok: true, data: { isPinned: false } });
        return new Promise((_resolve, reject) => { rejectToggle = reject; });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    const toggle = button.dispatch('click');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('none');

    rejectToggle(new Error('closed'));
    await toggle;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('none');
  });

  it('disables retry immediately and serializes a deferred retry GET', async () => {
    const document = createDocument();
    let resolveRetry;
    let reads = 0;
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        messages.push(message.type);
        if (message.type === 'GET_THREAD_STATE' && ++reads === 1) return Promise.reject(new Error('closed'));
        if (message.type === 'GET_THREAD_STATE') return new Promise((resolve) => { resolveRetry = resolve; });
        return Promise.resolve({ ok: true, data: { isPinned: true } });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    const retry = button.dispatch('click');
    expect(button.disabled).toBe(true);
    expect(messages).toEqual(['GET_THREAD_STATE', 'GET_THREAD_STATE']);

    button.dispatch('click');
    expect(messages).toEqual(['GET_THREAD_STATE', 'GET_THREAD_STATE']);

    resolveRetry({ ok: true, data: { isPinned: false } });
    await retry;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Fixar thread');
  });

  it('ignores a toggle completion after the route changes to a new button', async () => {
    const document = createDocument();
    let resolveToggle;
    const secondRoute = { ...route, id: 'space/space-two/topic/thread-two', spaceId: 'space-two', threadId: 'thread-two', url: 'https://chat.google.com/app/chat/space-two/topic/thread-two' };
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') return Promise.resolve({ ok: true, data: { isPinned: false } });
        return new Promise((resolve) => { resolveToggle = resolve; });
      }
    });

    await reconciler.reconcile(route);
    const oldButton = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    const toggle = oldButton.dispatch('click');
    const routeChange = reconciler.reconcile(secondRoute);
    resolveToggle({ ok: true, data: { isPinned: true } });
    await toggle;
    await routeChange;
    await Promise.resolve();
    const newButton = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');

    expect(newButton.getAttribute('aria-pressed')).toBe('false');
    expect(newButton.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
    expect(newButton.querySelector('path').getAttribute('fill')).toBe('none');
    expect(newButton.querySelector('path').getAttribute('stroke')).toBe('currentColor');
    expect(newButton.disabled).toBe(false);
  });

  it('offers an accessible retry action after a rejected read', async () => {
    const document = createDocument();
    let attempts = 0;
    const messages = [];
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage(message) {
        messages.push(message.type);
        if (message.type === 'GET_THREAD_STATE' && ++attempts === 1) return Promise.reject(new Error('closed'));
        return Promise.resolve({ ok: true, data: { isPinned: false } });
      }
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Tentar novamente');
    expect(button.getAttribute('title')).toBe('Tentar novamente');

    await button.dispatch('click');
    expect(messages).toEqual(['GET_THREAD_STATE', 'GET_THREAD_STATE']);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Fixar thread');
  });

  it('offers an accessible retry action after a negative state response', async () => {
    const document = createDocument();
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage: async () => ({ ok: false, error: { code: 'UNAVAILABLE' } })
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');

    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Tentar novamente');
  });

  it('marks pinned and unpinned states for visual distinction', async () => {
    const document = createDocument();
    let pinned = false;
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage: async (message) => ({ ok: true, data: { isPinned: message.type === 'TOGGLE_PIN' ? (pinned = !pinned) : pinned } })
    });

    await reconciler.reconcile(route);
    const button = document.header.nativeButton.parentElement.querySelector('[data-hot-threads-pin]');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('unpinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('none');
    expect(button.querySelector('path').getAttribute('stroke')).toBe('currentColor');
    await button.dispatch('click');
    expect(button.getAttribute('data-hot-threads-pin-state')).toBe('pinned');
    expect(button.querySelector('path').getAttribute('fill')).toBe('currentColor');
    expect(button.querySelector('path').getAttribute('stroke')).toBeNull();
    expect(button.getAttribute('fill')).toBe('currentColor');
  });

  it('does not retry an error state for mutation-only reconciliation but retries explicitly', async () => {
    const document = createDocument();
    let observer;
    class FakeMutationObserver {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() {}
      trigger() { this.callback(); }
    }
    let reads = 0;
    const reconciler = createPinButtonReconciler({
      document,
      MutationObserver: FakeMutationObserver,
      sendMessage(message) {
        if (message.type === 'GET_THREAD_STATE') reads += 1;
        return Promise.resolve({ ok: false, error: { code: 'UNAVAILABLE' } });
      }
    });

    reconciler.start();
    await reconciler.reconcile(route);
    observer.trigger();
    await Promise.resolve();
    await Promise.resolve();
    expect(reads).toBe(1);

    await reconciler.reconcile(route);
    expect(reads).toBe(2);
  });

  it('removes duplicate markers and markers left in a replaced header', async () => {
    const document = createDocument();
    const reconciler = createPinButtonReconciler({
      document,
      sendMessage: async () => ({ ok: true, data: { isPinned: false } })
    });

    await reconciler.reconcile(route);
    const duplicate = new FakeElement('button');
    duplicate.setAttribute('data-hot-threads-pin', '');
    document.header.nativeButton.parentElement.append(duplicate);
    const replacement = document.replaceHeader();
    await reconciler.reconcile(route);

    const markers = document.querySelectorAll('[data-hot-threads-pin]');
    expect(markers).toHaveLength(1);
    expect(markers[0].parentElement).toBe(replacement.nativeButton.parentElement);
  });
});
