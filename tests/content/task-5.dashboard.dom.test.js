// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createDashboardMount } from '../../src/content/dashboard-mount.js';
import { GET_DASHBOARD, OPEN_THREAD, UNPIN_THREAD } from '../../src/shared/protocol.js';

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

function createDashboardDom() {
  return new JSDOM(`<!doctype html>
    <html><body>
      <header>Header</header>
      <aside>Sidebar</aside>
      <main>Native content</main>
      <button type="button" data-trigger>Open Threads</button>
    </body></html>`, { url: 'https://chat.google.com/' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Task 5 dashboard data actions', () => {
  it('renders returned rows, stale text, and direct unpin action', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    const pinned = {
      id: 'pinned',
      title: 'Pinned thread',
      url: 'https://chat.google.com/app/chat/space/topic/pinned',
      isPinned: true,
      pinnedAt: 1,
      stale: true,
      lastAccessAt: null
    };
    const trending = {
      id: 'trending',
      title: 'Trending thread',
      url: 'https://chat.google.com/app/chat/space/topic/trending',
      accessCount: 3,
      lastAccessAt: 2
    };
    const messages = [];
    const sendMessage = vi.fn(async (message) => {
      messages.push(message);
      if (message.type === UNPIN_THREAD) return { ok: true, data: { ...pinned, isPinned: false, pinnedAt: null } };
      if (message.type === OPEN_THREAD) return { ok: true, data: { url: message.url } };
      return { ok: true, data: { pinned: [pinned], trending: [trending] } };
    });
    const mount = createDashboardMount({ document, sendMessage });

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    await flush();

    const host = document.querySelector('[data-hot-threads-dashboard]');
    const shadow = host.shadowRoot;
    expect(shadow.textContent).toContain('Pinned thread');
    expect(shadow.textContent).toContain('Trending thread');
    expect(shadow.textContent).toContain('Sem acesso há 14 dias');
    expect(shadow.querySelector('.unpin-button').textContent).toBe('Desafixar');
    expect(shadow.querySelector('.unpin-button').type).toBe('button');

    shadow.querySelector('.thread-link').click();
    shadow.querySelector('.unpin-button').click();
    await flush();

    expect(messages).toContainEqual({ type: OPEN_THREAD, url: pinned.url });
    expect(messages).toContainEqual({ type: UNPIN_THREAD, threadId: pinned.id });
    expect(shadow.textContent).not.toContain('Pinned thread');
    mount.stop();
    dom.window.close();
  });

  it('keeps returned navigation failures as an accessible dashboard error', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    const pinned = {
      id: 'pinned',
      title: 'Pinned thread',
      url: 'https://chat.google.com/app/chat/space/topic/pinned',
      isPinned: true,
      pinnedAt: 1,
      stale: false,
      lastAccessAt: 2
    };
    const sendMessage = vi.fn(async (message) => {
      if (message.type === OPEN_THREAD) return { ok: false, error: { message: 'Navigation rejected' } };
      if (message.type === UNPIN_THREAD) return { ok: false, error: { message: 'Unpin rejected' } };
      return { ok: true, data: { pinned: [pinned], trending: [] } };
    });
    const mount = createDashboardMount({ document, sendMessage });
    mount.open({ trigger: document.querySelector('[data-trigger]') });
    await flush();

    const host = document.querySelector('[data-hot-threads-dashboard]');
    host.shadowRoot.querySelector('.thread-link').click();
    host.shadowRoot.querySelector('.unpin-button').click();
    await flush();

    expect(host.shadowRoot.querySelector('[role="alert"]').textContent).toContain('Unpin rejected');
    mount.stop();
    dom.window.close();
  });
});
