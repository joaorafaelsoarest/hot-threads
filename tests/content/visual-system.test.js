// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  CONTROL_ATTRIBUTE,
  CONTROL_VARIANT_ATTRIBUTE,
  createReactIcon,
  createSvgIcon,
  ensurePluginStyles,
  configureControl
} from '../../src/content/ui/visual-system.js';

describe('shared visual system', () => {
  it('creates local SVG icons with a consistent accessible-safe contract', () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    const icon = createSvgIcon(dom.window.document, 'flame');

    expect(icon.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(icon.getAttribute('width')).toBe('20');
    expect(icon.getAttribute('height')).toBe('20');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('data-hot-threads-icon')).toBe('flame');
    expect(icon.querySelector('path')).not.toBeNull();
    expect(icon.querySelector('path').getAttribute('fill')).toBe('currentColor');

    dom.window.close();
  });

  it('renders the same icon descriptor through the React-compatible factory', () => {
    const element = createReactIcon((type, props, child) => ({ type, props, child }), 'refresh');

    expect(element.type).toBe('svg');
    expect(element.props.viewBox).toBe('0 0 24 24');
    expect(element.props.width).toBe(20);
    expect(element.props.height).toBe(20);
    expect(element.props['aria-hidden']).toBe(true);
    expect(element.props['data-hot-threads-icon']).toBe('refresh');
    expect(element.child.type).toBe('path');
    expect(element.child.props.fill).toBe('currentColor');
  });

  it('configures namespaced control variants without relying on page-owned classes', () => {
    const dom = new JSDOM('<!doctype html><html><body><button></button></body></html>');
    const button = dom.window.document.querySelector('button');

    configureControl(button, 'menu-header');

    expect(button.hasAttribute(CONTROL_ATTRIBUTE)).toBe(true);
    expect(button.getAttribute(CONTROL_VARIANT_ATTRIBUTE)).toBe('menu-header');
    expect(button.type).toBe('button');

    dom.window.close();
  });

  it('injects one shared stylesheet and includes theme-safe control states', () => {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');

    const first = ensurePluginStyles(dom.window.document);
    const second = ensurePluginStyles(dom.window.document);

    expect(first).toBe(second);
    expect(dom.window.document.querySelectorAll('[data-hot-threads-style]')).toHaveLength(1);
    expect(first.textContent).toContain('--ht-color-surface');
    expect(first.textContent).toContain('button[data-hot-threads-control]');
    expect(first.textContent).toContain(':focus-visible');
    expect(first.textContent).toContain('forced-colors');

    dom.window.close();
  });
});
