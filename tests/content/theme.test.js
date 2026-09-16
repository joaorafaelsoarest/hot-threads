// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDashboardMount } from '../../src/content/dashboard-mount.js';

const styles = readFileSync(resolve(process.cwd(), 'src/content/ui/styles.css'), 'utf8');
const controlStyles = readFileSync(resolve(process.cwd(), 'src/content/ui/controls.css'), 'utf8');
const visualStyles = `${controlStyles}\n${styles}`;

describe('dashboard theme and keyboard accessibility', () => {
  it('inherits page color, color scheme, and font at the Shadow DOM boundary', () => {
    expect(styles).toMatch(/:host\s*\{[^}]*\bcolor:\s*var\(--ht-color-text\)\s*;/s);
    expect(styles).toMatch(/:host\s*\{[^}]*\bcolor-scheme:\s*inherit\s*;/s);
    expect(styles).toMatch(/:host\s*\{[^}]*\bfont-family:\s*var\(--ht-font-ui\)\s*;/s);
    expect(visualStyles).toContain("'Google Sans'");
    expect(visualStyles).toContain('Arial, sans-serif');
  });

  it('uses inherited currentColor with Canvas and CanvasText fallbacks', () => {
    expect(styles).toMatch(/\.dashboard-shell\s*\{[^}]*\bcolor:\s*var\(--ht-color-text\)\s*;/s);
    expect(styles).toMatch(/\.dashboard-shell\s*\{[^}]*\bbackground:\s*var\(--ht-color-surface\)\s*;/s);
    expect(controlStyles).toMatch(/button\[data-hot-threads-control\]\s*\{[^}]*\bcolor:\s*var\(--ht-color-text-variant\)\s*;/s);
    expect(styles).toMatch(/\.dashboard-kicker\s*\{[^}]*\bcolor:\s*var\(--ht-color-text-variant\)\s*;/s);
  });

  it('gives keyboard-visible controls a nonzero focus outline', () => {
    expect(controlStyles).toMatch(/button\[data-hot-threads-control\]:focus-visible\s*\{[^}]*\boutline:\s*2px\s+solid\s+var\(--ht-focus-ring\)\s*;/s);
    expect(controlStyles).toMatch(/button\[data-hot-threads-control\]:focus-visible\s*\{[^}]*\boutline-offset:\s*2px\s*;/s);
  });

  it('keeps semantic secondary tokens and local dark-theme fallbacks', () => {
    expect(controlStyles).toContain('--ht-color-secondary-container: var(--gm3-color-secondary-container, #c2e7ff);');
    expect(controlStyles).toContain('--ht-color-on-secondary-container: var(--gm3-color-on-secondary-container, #001d35);');
    expect(controlStyles).not.toContain('--ht-color-primary-container');
    expect(controlStyles).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*--ht-color-surface:\s*#202124\s*;/);
    expect(controlStyles).toContain(":host-context([data-theme='dark'])");
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
