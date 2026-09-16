// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { findThreadHeader } from '../../src/content/dom-anchors.js';
import { startContentScript } from '../../src/content/index.js';

const route = {
  id: 'space/AAQAjyQNkuo/topic/BuQDqtuyPmM',
  spaceId: 'AAQAjyQNkuo',
  threadId: 'BuQDqtuyPmM',
  url: 'https://chat.google.com/app/chat/AAQAjyQNkuo/topic/BuQDqtuyPmM'
};

function createGoogleChatThreadDom({ control = 'Open in full screen' } = {}) {
  return new JSDOM(`<!doctype html>
    <html>
      <body>
        <header id="gb" role="banner">
          <div class="gb_Td">
            <div class="gb_2d gb_Ad gb_Bd">
              <div aria-label="Main menu"></div>
              <div class="gb_3c">
                <div class="gb_4c">
                  <a aria-label="Chat logo"><img alt="Chat" /></a>
                </div>
              </div>
            </div>
            <div class="gb_2d gb_ae">
              <div class="gb_Te">
                <form id="aso_search_form_anchor" role="search" aria-label="Search chat"></form>
              </div>
            </div>
          </div>
        </header>
        <div id="dynamite-main-content">
          <div data-navigation-branch>
            <div data-section-type="10">
              <div class="XLj4c">
                <div class="Hot7Sb">
                  <div id="ucc-1" aria-controls="ucc-0">
                    <div id="c0" role="button">Shortcuts</div>
                  </div>
                </div>
                <div id="ucc-0" aria-labelledby="ucc-1">
                  <div data-shortcut-container-id="WkVP0e">
                    <div aria-label="Starred shortcut" tabindex="-1" jsaction="click:j50Gyb;">
                      <div>Starred</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div data-central-pane>
            <div jsname="Zpe2Q">
              <div class="sfHBOc"><span>Thread</span></div>
              <div class="bWWUQe">
                <div class="DaIyce">
                  <button type="button" aria-label="${control}"></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>`, { url: route.url });
}

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('Google Chat DOM compatibility', () => {
  it('finds the current thread toolbar without a semantic header element', () => {
    const dom = createGoogleChatThreadDom();
    const header = findThreadHeader(dom.window.document);

    expect(header).not.toBeNull();
    expect(header.querySelector('button[aria-label="Open in full screen"]')).not.toBeNull();

    dom.window.close();
  });

  it('inserts the menu between the visible Chat logo and search', async () => {
    const dom = createGoogleChatThreadDom();
    const messages = [];
    const cleanup = startContentScript({
      window: dom.window,
      document: dom.window.document,
      MutationObserver: undefined,
      sendMessage: async (message) => {
        messages.push(message.type);
        return { ok: true, data: { isPinned: false } };
      }
    });

    await flush();

    const menu = dom.window.document.querySelector('[data-hot-threads-menu]');
    const starred = dom.window.document.querySelector('[aria-label="Starred shortcut"]');
    const logoCluster = dom.window.document.querySelector('.gb_3c');

    expect(menu).not.toBeNull();
    expect(menu.getAttribute('aria-label')).toBe('🔥 Threads');
    expect(menu.parentElement).toBe(logoCluster.parentElement);
    expect(menu.previousElementSibling).toBe(logoCluster);
    expect(starred.nextElementSibling).not.toBe(menu);

    cleanup();
    dom.window.close();
  });

  it('inserts the pin button and keeps the existing route/message flow', async () => {
    const dom = createGoogleChatThreadDom();
    const messages = [];
    const cleanup = startContentScript({
      window: dom.window,
      document: dom.window.document,
      MutationObserver: undefined,
      sendMessage: async (message) => {
        messages.push(message);
        return { ok: true, data: { isPinned: message.type === 'TOGGLE_PIN' } };
      }
    });

    await flush();

    const pin = dom.window.document.querySelector('[data-hot-threads-pin]');
    expect(pin).not.toBeNull();
    expect(pin.getAttribute('aria-label')).toBe('Fixar thread');

    pin.click();
    await flush();

    expect(pin.getAttribute('aria-pressed')).toBe('true');
    expect(messages.map((message) => message.type)).toEqual([
      'GET_THREAD_STATE',
      'SYNC_THREAD',
      'TOGGLE_PIN'
    ]);
    expect(messages.find((message) => message.type === 'SYNC_THREAD').thread).toMatchObject(route);

    cleanup();
    dom.window.close();
  });

  it('keeps the pin button in the toolbar when the current control is Close', async () => {
    const dom = createGoogleChatThreadDom({ control: 'Close' });
    const cleanup = startContentScript({
      window: dom.window,
      document: dom.window.document,
      MutationObserver: undefined,
      sendMessage: async () => ({ ok: true, data: { isPinned: false } })
    });

    await flush();

    const pin = dom.window.document.querySelector('[data-hot-threads-pin]');
    const toolbar = dom.window.document.querySelector('.DaIyce');

    expect(pin).not.toBeNull();
    expect(pin.parentElement).toBe(toolbar);

    cleanup();
    dom.window.close();
  });
});
