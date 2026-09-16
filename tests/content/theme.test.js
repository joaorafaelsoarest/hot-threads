// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDashboardMount } from '../../src/content/dashboard-mount.js';

const styles = readFileSync(resolve(process.cwd(), 'src/content/ui/styles.css'), 'utf8');

describe('dashboard theme and keyboard accessibility', () => {
  it('inherits page color, color scheme, and font at the Shadow DOM boundary', () => {
    expect(styles).toMatch(/:host\s*\{[^}]*\bcolor:\s*inherit\s*;/s);
    expect(styles).toMatch(/:host\s*\{[^}]*\bcolor-scheme:\s*inherit\s*;/s);
    expect(styles).toMatch(/:host\s*\{[^}]*\bfont-family:\s*inherit\s*;/s);
    expect(styles).toContain("'Google Sans'");
    expect(styles).toContain('Arial, sans-serif');
  });

  it('uses inherited currentColor with Canvas and CanvasText fallbacks', () => {
    expect(styles).toMatch(/\.dashboard-shell\s*\{[^}]*\bcolor:\s*CanvasText\s*;/s);
    expect(styles).toMatch(/\.dashboard-shell\s*\{[^}]*\bbackground:\s*Canvas\s*;/s);
    expect(styles).toMatch(/button\s*\{[^}]*\bcolor:\s*currentColor\s*;/s);
    expect(styles).toMatch(/\.dashboard-kicker\s*\{[^}]*\bcolor:\s*currentColor\s*;/s);
  });

  it('gives keyboard-visible controls a nonzero focus outline', () => {
    expect(styles).toMatch(/button:focus-visible\s*\{[^}]*\boutline:\s*3px\s+solid\s+currentColor\s*;/s);
    expect(styles).toMatch(/button:focus-visible\s*\{[^}]*\boutline-offset:\s*3px\s*;/s);
  });

  it('renders the dashboard actions as native keyboard-focusable buttons', () => {
    const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {
      url: 'https://chat.google.com/'
    });
    const mount = createDashboardMount({
      document: dom.window.document,
      sendMessage: async () => ({ ok: true, data: { pinned: [], trending: [] } })
    });

    mount.open();

    const shadow = dom.window.document.querySelector('[data-hot-threads-dashboard]').shadowRoot;
    const controls = [...shadow.querySelectorAll('button')];
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((button) => button.type === 'button')).toBe(true);
    controls[0].focus();
    expect(shadow.activeElement).toBe(controls[0]);

    mount.stop();
    dom.window.close();
  });
});
