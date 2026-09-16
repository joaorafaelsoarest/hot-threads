// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { createDashboardMount } from '../../src/content/dashboard-mount.js';

function createStructuralDashboardDom() {
  return new JSDOM(`<!doctype html>
    <html><body>
      <div data-chat-shell>
        <aside aria-label="Navigation">
          <div role="heading">Shortcuts</div>
          <div role="list"><div role="button">Starred</div></div>
        </aside>
        <div data-central-pane style="display: grid; color: rebeccapurple" aria-hidden="false">
          <header aria-label="Thread title">
            <div><button type="button" aria-label="Open in full screen"></button></div>
          </header>
          <div>Native central content</div>
        </div>
      </div>
    </body></html>`, { url: 'https://chat.google.com/' });
}

function createHomeDashboardDom() {
  return new JSDOM(`<!doctype html>
    <html><body>
      <div data-chat-shell>
        <aside aria-label="Navigation">
          <div role="heading">Shortcuts</div>
          <div role="list"><div role="button">Starred</div></div>
        </aside>
        <div data-central-home style="display: flex; color: darkslateblue" aria-hidden="false">
          <div>Native home content</div>
        </div>
      </div>
    </body></html>`, { url: 'https://chat.google.com/app/home' });
}

describe('Dashboard structural layout fallback', () => {
  it('mounts beside a non-semantic central pane and restores it on close', () => {
    const dom = createStructuralDashboardDom();
    const { document } = dom.window;
    const central = document.querySelector('[data-central-pane]');
    const navigation = document.querySelector('aside[aria-label="Navigation"]');
    const mount = createDashboardMount({
      document,
      sendMessage: async () => ({ ok: true, data: { pinned: [], trending: [] } })
    });

    const host = mount.open();

    expect(host.parentElement).toBe(central.parentElement);
    expect(host.previousElementSibling).toBe(central);
    expect(host.style.display).toBe('block');
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(central.style.display).toBe('none');
    expect(central.getAttribute('aria-hidden')).toBe('true');
    expect(navigation.getAttribute('aria-hidden')).toBeNull();

    mount.close();

    expect(central.getAttribute('style')).toBe('display: grid; color: rebeccapurple');
    expect(central.getAttribute('aria-hidden')).toBe('false');
    expect(host.hidden).toBe(true);

    mount.stop();
    dom.window.close();
  });

  it('mounts beside the home pane without a thread header and hides only that pane', () => {
    const dom = createHomeDashboardDom();
    const { document } = dom.window;
    const central = document.querySelector('[data-central-home]');
    const navigation = document.querySelector('aside[aria-label="Navigation"]');
    const mount = createDashboardMount({
      document,
      sendMessage: async () => ({ ok: true, data: { pinned: [], trending: [] } })
    });

    const host = mount.open();

    expect(host.parentElement).toBe(central.parentElement);
    expect(host.previousElementSibling).toBe(central);
    expect(host.style.flex).toBe('1 1 auto');
    expect(host.style.width).toBe('100%');
    expect(host.style.height).toBe('100%');
    expect(central.style.display).toBe('none');
    expect(central.getAttribute('aria-hidden')).toBe('true');
    expect(navigation.getAttribute('aria-hidden')).toBeNull();
    expect([...document.querySelectorAll('[aria-hidden="true"]')]).toEqual([central]);

    mount.close();

    expect(central.getAttribute('style')).toBe('display: flex; color: darkslateblue');
    expect(central.getAttribute('aria-hidden')).toBe('false');

    mount.stop();
    dom.window.close();
  });
});
