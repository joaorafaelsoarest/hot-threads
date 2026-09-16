// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createSidebarInjector } from '../../src/content/sidebar-injector.js';
import { createDashboardMount } from '../../src/content/dashboard-mount.js';
import { startContentScript } from '../../src/content/index.js';
import { GET_DASHBOARD, OPEN_THREAD } from '../../src/shared/protocol.js';

const styles = readFileSync(`${process.cwd()}/src/content/ui/styles.css`, 'utf8');
const controlStyles = readFileSync(`${process.cwd()}/src/content/ui/controls.css`, 'utf8');
const visualStyles = `${controlStyles}\n${styles}`;

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const flushDom = async (dom, turns = 4) => {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
  }
};

function createSidebarDom() {
  return new JSDOM(`<!doctype html>
    <html>
      <body>
        <header aria-label="Global header"></header>
        <aside aria-label="Navigation">
          <div role="heading">Shortcuts</div>
          <div role="list">
            <div role="button" tabindex="0">Starred</div>
            <div role="button" tabindex="0">Recent</div>
          </div>
        </aside>
      </body>
    </html>`, { url: 'https://chat.google.com/' });
}

function createDashboardDom() {
  return new JSDOM(`<!doctype html>
    <html>
      <body>
        <header aria-label="Global header">Header</header>
        <aside aria-label="Navigation">Sidebar</aside>
        <main style="display: grid; color: rebeccapurple" aria-hidden="false">Native central content</main>
        <button type="button" data-trigger>Open Threads</button>
      </body>
    </html>`, { url: 'https://chat.google.com/' });
}

function createMultipleSemanticSectionsDom() {
  return new JSDOM(`<!doctype html>
    <html><body>
      <aside aria-label="Navigation">
        <section aria-labelledby="shortcuts-a">
          <h2 id="shortcuts-a">Shortcuts</h2>
          <div role="list"><div role="button">Recent</div></div>
        </section>
        <section aria-labelledby="other-section">
          <h2 id="other-section">Other</h2>
          <div role="list"><div role="button">Starred</div></div>
        </section>
        <section aria-labelledby="shortcuts-b">
          <h2 id="shortcuts-b">Shortcuts</h2>
          <div role="list"><div role="button">Starred</div></div>
        </section>
      </aside>
    </body></html>`, { url: 'https://chat.google.com/' });
}

function createNestedSemanticBoundaryDom() {
  return new JSDOM(`<!doctype html>
    <html><body>
      <aside aria-label="Navigation">
        <section aria-labelledby="outer-shortcuts">
          <h2 id="outer-shortcuts">Shortcuts</h2>
          <div role="list"><div role="button">Recent</div></div>
          <section aria-label="Nested actions">
            <div role="button">Starred</div>
          </section>
        </section>
      </aside>
    </body></html>`, { url: 'https://chat.google.com/' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('semantic sidebar injector', () => {
  it('finds Shortcuts by accessible text and inserts a keyboard-accessible menu after Starred', () => {
    const dom = createSidebarDom();
    const onOpen = vi.fn();
    const injector = createSidebarInjector({
      document: dom.window.document,
      MutationObserver: undefined,
      onOpen
    });

    const button = injector.reconcile();
    const starred = dom.window.document.querySelector('[role="button"]');

    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Threads');
    expect(button.hasAttribute('data-hot-threads-menu')).toBe(true);
    expect(starred.nextElementSibling).toBe(button);
    expect(button.textContent).toContain('Threads');
    expect(button.querySelector('[data-hot-threads-icon="flame"]')).not.toBeNull();
    expect(button.getAttribute('data-hot-threads-variant')).toBe('menu-sidebar');

    button.focus();
    expect(dom.window.document.activeElement).toBe(button);
    expect(button.getAttribute('data-hot-threads-control')).not.toBeNull();
    button.blur();
    button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.click();
    button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    button.click();
    expect(onOpen).toHaveBeenCalledTimes(2);

    dom.window.close();
  });

  it('keeps exactly one menu button after repeated reconciliation and duplicate insertion', () => {
    const dom = createSidebarDom();
    const injector = createSidebarInjector({
      document: dom.window.document,
      MutationObserver: undefined
    });

    const first = injector.reconcile();
    const duplicate = dom.window.document.createElement('button');
    duplicate.setAttribute('data-hot-threads-menu', '');
    dom.window.document.querySelector('aside').append(duplicate);
    injector.reconcile();
    injector.reconcile();

    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(1);
    expect(dom.window.document.querySelector('[data-hot-threads-menu]')).toBe(first);
    expect(first.previousElementSibling.textContent.trim()).toBe('Starred');

    dom.window.close();
  });

  it('attaches retained button behavior exactly once across repeated reconciliation', () => {
    const dom = createSidebarDom();
    const document = dom.window.document;
    const starred = document.querySelector('[role="button"]');
    const seeded = document.createElement('button');
    seeded.setAttribute('type', 'button');
    seeded.setAttribute('aria-label', 'Threads');
    seeded.setAttribute('data-hot-threads-menu', '');
    seeded.textContent = 'Threads';
    starred.parentElement.append(seeded);
    const onOpen = vi.fn();
    const injector = createSidebarInjector({ document, MutationObserver: undefined, onOpen });

    injector.reconcile();
    injector.reconcile();
    seeded.focus();
    expect(seeded.getAttribute('data-hot-threads-control')).not.toBeNull();
    expect(seeded.tagName).toBe('BUTTON');
    seeded.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    seeded.click();
    seeded.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    seeded.click();
    expect(onOpen).toHaveBeenCalledTimes(2);

    injector.reconcile();
    seeded.click();
    expect(onOpen).toHaveBeenCalledTimes(3);
    dom.window.close();
  });

  it('settles one external body mutation with a real JSDOM observer and no callback loop', async () => {
    const dom = createSidebarDom();
    let callbackCount = 0;
    class CountingMutationObserver {
      constructor(callback) {
        this.observer = new dom.window.MutationObserver((records) => {
          callbackCount += 1;
          callback(records);
          if (callbackCount >= 2) this.observer.disconnect();
        });
      }

      observe(...args) { this.observer.observe(...args); }
      disconnect() { this.observer.disconnect(); }
    }

    const injector = createSidebarInjector({
      document: dom.window.document,
      MutationObserver: CountingMutationObserver
    });
    injector.start();
    dom.window.document.body.append(dom.window.document.createElement('div'));
    await flushDom(dom);

    expect(callbackCount).toBe(1);
    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(1);
    injector.stop();
    dom.window.close();
  });

  it('does not cross semantic section boundaries to bind an unrelated Starred action', () => {
    const dom = createMultipleSemanticSectionsDom();
    const injector = createSidebarInjector({ document: dom.window.document, MutationObserver: undefined });

    const button = injector.reconcile();
    const localShortcuts = dom.window.document.querySelector('#shortcuts-b').parentElement;
    const unrelatedSection = dom.window.document.querySelector('#other-section').parentElement;
    const localStarred = localShortcuts.querySelector('[role="button"]');
    const unrelatedStarred = unrelatedSection.querySelector('[role="button"]');

    expect(button).not.toBeNull();
    expect(button.previousElementSibling).toBe(localStarred);
    expect(button.parentElement).toBe(localStarred.parentElement);
    expect(button.previousElementSibling).not.toBe(unrelatedStarred);
    expect(button.parentElement).not.toBe(unrelatedStarred.parentElement);
    dom.window.close();
  });

  it('does not bind a Starred action inside a nested semantic boundary', () => {
    const dom = createNestedSemanticBoundaryDom();
    const injector = createSidebarInjector({ document: dom.window.document, MutationObserver: undefined });

    const button = injector.reconcile();

    expect(button).toBeNull();
    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(0);
    dom.window.close();
  });

  it('keeps the dashboard font inherited while retaining a Google Sans/system fallback declaration', () => {
    expect(visualStyles).toMatch(/:host[\s\S]*--ht-font-ui/);
    expect(visualStyles).toContain("'Google Sans'");
    expect(visualStyles).toContain('Arial, sans-serif');
  });
});

describe('dashboard mount', () => {
  it('hides only native central content and restores its exact state and focus on close', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    const trigger = document.querySelector('[data-trigger]');
    const central = document.querySelector('main');
    const sendMessage = vi.fn().mockResolvedValue({ ok: true, data: { pinned: [], trending: [] } });
    const mount = createDashboardMount({ document, sendMessage });

    trigger.focus();
    mount.open({ trigger });

    expect(central.style.display).toBe('none');
    expect(central.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('header').getAttribute('aria-hidden')).toBeNull();
    expect(document.querySelector('aside').getAttribute('aria-hidden')).toBeNull();
    expect(document.querySelector('[data-hot-threads-dashboard]').shadowRoot).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledWith({ type: GET_DASHBOARD });

    await flush();
    mount.close();

    expect(central.getAttribute('style')).toBe('display: grid; color: rebeccapurple');
    expect(central.getAttribute('aria-hidden')).toBe('false');
    expect(document.activeElement).toBe(trigger);

    mount.stop();
    dom.window.close();
  });

  it('mounts the React shell inside a reusable Shadow DOM host', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    const mount = createDashboardMount({
      document,
      sendMessage: async () => ({
        ok: true,
        data: {
          pinned: [{ id: 'pinned-1', title: 'Pinned thread' }],
          trending: [{ id: 'hot-1', title: 'Hot thread' }]
        }
      })
    });

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    await flush();

    const host = document.querySelector('[data-hot-threads-dashboard]');
    expect(document.querySelectorAll('[data-hot-threads-dashboard]')).toHaveLength(1);
    expect(host.shadowRoot.querySelector('h1').textContent).toContain('Threads');
    expect(host.shadowRoot.querySelector('h2').textContent).toBe('Fixadas');
    expect(host.shadowRoot.textContent).toContain('Em alta hoje');
    expect(host.shadowRoot.textContent).toContain('Pinned thread');
    expect(host.shadowRoot.textContent).toContain('Hot thread');
    const backButton = host.shadowRoot.querySelector('button[type="button"]');
    expect(backButton.textContent).toContain('Voltar');
    expect(backButton.getAttribute('data-hot-threads-control')).not.toBeNull();
    expect(backButton.getAttribute('data-hot-threads-variant')).toBe('text');
    expect(backButton.querySelector('[data-hot-threads-icon="arrow-back"]')).not.toBeNull();

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    expect(document.querySelectorAll('[data-hot-threads-dashboard]')).toHaveLength(1);
    mount.stop();
    dom.window.close();
  });

  it('renders local loading, error, and empty states without external requests', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    let resolveMessage;
    const sendMessage = vi.fn(() => new Promise((resolve) => { resolveMessage = resolve; }));
    const mount = createDashboardMount({ document, sendMessage });

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    expect(document.querySelector('[data-hot-threads-dashboard]').shadowRoot.querySelector('[role="status"]').textContent)
      .toContain('Carregando');
    expect(document.querySelector('[data-hot-threads-dashboard]').shadowRoot.querySelector('[role="status"]')
      .getAttribute('aria-live')).toBe('polite');
    expect(document.querySelector('[data-hot-threads-dashboard]').shadowRoot.textContent)
      .not.toContain('Nenhuma thread fixada.');
    expect(document.querySelector('[data-hot-threads-dashboard]').shadowRoot.textContent)
      .not.toContain('Nenhuma thread em alta hoje.');

    resolveMessage({ ok: false, error: { message: 'Dashboard unavailable' } });
    await flush();
    const shadow = document.querySelector('[data-hot-threads-dashboard]').shadowRoot;
    expect(shadow.querySelector('[role="alert"]').textContent).toContain('Dashboard unavailable');
    expect(shadow.querySelector('[role="alert"]').getAttribute('aria-live')).toBe('assertive');
    expect(shadow.querySelector('.retry-button').type).toBe('button');
    expect(shadow.querySelector('.retry-button').getAttribute('data-hot-threads-control')).not.toBeNull();
    expect(shadow.querySelector('.retry-button').querySelector('[data-hot-threads-icon="refresh"]')).not.toBeNull();
    expect(shadow.textContent).not.toContain('Nenhuma thread fixada.');
    expect(shadow.textContent).not.toContain('Nenhuma thread em alta hoje.');

    mount.close();
    const emptyMessage = vi.fn().mockResolvedValue({ ok: true, data: { pinned: [], trending: [] } });
    const emptyMount = createDashboardMount({ document, sendMessage: emptyMessage });
    emptyMount.open({ trigger: document.querySelector('[data-trigger]') });
    await flush();
    const emptyShadow = document.querySelector('[data-hot-threads-dashboard]').shadowRoot;
    expect(emptyShadow.querySelector('[role="status"]').textContent).toContain('Nenhuma');
    expect(emptyShadow.textContent).toContain('Nenhuma thread fixada.');
    expect(emptyShadow.textContent).toContain('Nenhuma thread em alta hoje.');

    emptyMount.stop();
    mount.stop();
    dom.window.close();
  });

  it('keeps retry state transitions accessible', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    let attempt = 0;
    const sendMessage = vi.fn(async () => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, error: { message: 'Dashboard unavailable' } }
        : { ok: true, data: { pinned: [], trending: [] } };
    });
    const mount = createDashboardMount({ document, sendMessage });

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    const host = document.querySelector('[data-hot-threads-dashboard]');
    expect(host.shadowRoot.querySelector('[role="status"]').getAttribute('aria-live')).toBe('polite');
    await flush();
    expect(host.shadowRoot.querySelector('[role="alert"]').getAttribute('aria-live')).toBe('assertive');

    host.shadowRoot.querySelector('.retry-button').click();
    expect(host.shadowRoot.querySelector('[role="status"]').textContent).toContain('Carregando');
    await flush();
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(host.shadowRoot.querySelector('[role="status"]').textContent).toContain('Nenhuma');
    mount.stop();
    dom.window.close();
  });

  it('opens a thread item through OPEN_THREAD for click and keyboard activation', async () => {
    const dom = createDashboardDom();
    const { document } = dom.window;
    const messages = [];
    const thread = { id: 'hot-1', url: 'https://chat.google.com/app/chat/space/topic/hot-1', title: 'Hot thread' };
    const mount = createDashboardMount({
      document,
      sendMessage: async (message) => {
        messages.push(message);
        if (message.type === OPEN_THREAD) return { ok: true };
        return { ok: true, data: { pinned: [thread], trending: [] } };
      }
    });

    mount.open({ trigger: document.querySelector('[data-trigger]') });
    await flush();
    const shadow = document.querySelector('[data-hot-threads-dashboard]').shadowRoot;
    const threadButton = shadow.querySelector('.thread-link');
    expect(threadButton.tagName).toBe('BUTTON');
    expect(threadButton.type).toBe('button');
    threadButton.focus();
    expect(shadow.activeElement).toBe(threadButton);
    threadButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    threadButton.click();
    threadButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    threadButton.click();
    await flush();

    expect(messages.filter((message) => message.type === OPEN_THREAD)).toEqual([
      { type: OPEN_THREAD, url: thread.url },
      { type: OPEN_THREAD, url: thread.url }
    ]);
    mount.stop();
    dom.window.close();
  });

  it('wires the dashboard menu without disrupting route and pin startup', async () => {
    const dom = new JSDOM(`<!doctype html>
      <html><body>
        <header id="gb" role="banner">
          <div class="gb_Td">
            <div class="gb_2d gb_Ad gb_Bd">
              <div aria-label="Main menu"></div>
              <div class="gb_3c"><div class="gb_4c"><a aria-label="Chat logo"><img alt="Chat" /></a></div></div>
            </div>
            <div class="gb_2d gb_ae"><div class="gb_Te"><form id="aso_search_form_anchor" role="search" aria-label="Search chat"></form></div></div>
          </div>
        </header>
        <header aria-label="Thread title"><div><button aria-label="Open in full screen"></button></div></header>
        <aside aria-label="Navigation">
          <div role="heading">Shortcuts</div>
          <div role="list"><div role="button">Starred</div></div>
        </aside>
        <main>Native content</main>
    </body></html>`, { url: 'https://chat.google.com/app/chat/space/topic/thread' });
    const messages = [];
    const cleanup = startContentScript({
      window: dom.window,
      document: dom.window.document,
      MutationObserver: undefined,
      sendMessage: async (message) => {
        messages.push(message.type);
        if (message.type === GET_DASHBOARD) return { ok: true, data: { pinned: [], trending: [] } };
        return { ok: true, data: { isPinned: false } };
      }
    });

    await flush();
    const menu = dom.window.document.querySelector('[data-hot-threads-menu]');
    expect(dom.window.document.querySelector('[data-hot-threads-pin]')).not.toBeNull();
    expect(dom.window.document.querySelector('aside [data-hot-threads-menu]')).not.toBeNull();
    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(2);
    expect(dom.window.document.querySelectorAll('[data-hot-threads-style]')).toHaveLength(1);
    menu.click();
    await flush();

    expect(messages).toContain(GET_DASHBOARD);
    expect(dom.window.document.querySelector('[data-hot-threads-dashboard]')).not.toBeNull();
    cleanup();
    dom.window.close();
  });
});
