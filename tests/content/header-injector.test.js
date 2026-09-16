// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createHeaderInjector } from '../../src/content/header-injector.js';

const flushDom = async (dom) => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
};

function createGoogleChatHomeDom() {
  return new JSDOM(`<!doctype html>
    <html>
      <body>
        <header id="gb" role="banner">
          <div class="gb_Td">
            <div class="gb_2d gb_Ad gb_Bd" data-left-cluster>
              <div aria-label="Main menu"></div>
              <div class="gb_3c">
                <div class="gb_4c">
                  <a aria-label="Chat logo" style="visibility: hidden"></a>
                  <a aria-label="Chat logo"><img alt="Chat" /></a>
                </div>
              </div>
            </div>
            <div class="gb_2d gb_ae" data-search-layout>
              <div class="gb_Te">
                <form id="aso_search_form_anchor" role="search" aria-label="Search chat"></form>
              </div>
            </div>
          </div>
          <div data-right-actions></div>
        </header>
        <aside aria-label="Navigation">
          <div role="heading">Shortcuts</div>
          <div role="list">
            <div role="button">Starred</div>
            <button type="button" data-hot-threads-menu>🔥 Threads</button>
          </div>
        </aside>
      </body>
    </html>`, { url: 'https://chat.google.com/app/home' });
}

describe('Google Chat header injector', () => {
  it('places exactly one menu between the visible Chat logo and search', () => {
    const dom = createGoogleChatHomeDom();
    const onOpen = vi.fn();
    const injector = createHeaderInjector({
      document: dom.window.document,
      MutationObserver: undefined,
      onOpen
    });

    const button = injector.reconcile();
    const leftCluster = dom.window.document.querySelector('[data-left-cluster]');
    const logoCluster = leftCluster.querySelector('.gb_3c');

    expect(button).not.toBeNull();
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toBe('Threads');
    expect(button.hasAttribute('data-hot-threads-control')).toBe(true);
    expect(button.getAttribute('data-hot-threads-variant')).toBe('menu-header');
    expect(button.querySelector('[data-hot-threads-icon="flame"]')).not.toBeNull();
    expect(button.querySelector('span').textContent).toBe('Threads');
    expect(dom.window.getComputedStyle(button).borderRadius).toContain('--ht-radius-pill');
    expect(dom.window.getComputedStyle(button).fontSize).toBe('14px');
    expect(button.parentElement).toBe(leftCluster);
    expect(button.previousElementSibling).toBe(logoCluster);
    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(1);
    expect(dom.window.document.querySelector('aside [data-hot-threads-menu]')).toBeNull();

    button.click();
    expect(onOpen).toHaveBeenCalledWith(button);
    dom.window.close();
  });

  it('keeps the header menu while the sidebar is replaced during expansion', async () => {
    const dom = createGoogleChatHomeDom();
    const injector = createHeaderInjector({
      document: dom.window.document,
      MutationObserver: dom.window.MutationObserver
    });

    injector.start();
    const first = dom.window.document.querySelector('[data-hot-threads-menu]');
    dom.window.document.querySelector('aside').innerHTML = `
      <div role="heading">Shortcuts</div>
      <div role="list"><div role="button">Starred</div><div>Expanded settings</div></div>`;
    await flushDom(dom);

    expect(dom.window.document.querySelector('[data-hot-threads-menu]')).toBe(first);
    expect(dom.window.document.querySelectorAll('[data-hot-threads-menu]')).toHaveLength(1);
    expect(first.parentElement).toBe(dom.window.document.querySelector('[data-left-cluster]'));
    expect(first.getAttribute('aria-label')).toBe('Threads');

    injector.stop();
    dom.window.close();
  });
});
