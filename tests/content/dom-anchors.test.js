import { describe, expect, it } from 'vitest';
import { findThreadHeader } from '../../src/content/dom-anchors.js';

function createDocument(headers) {
  return {
    querySelectorAll(selector) {
      if (selector === 'header[aria-label]') return headers;
      if (selector.startsWith('button[')) return [];
      throw new Error(`Unexpected selector: ${selector}`);
    }
  };
}

function createHeader(buttonLabels, ariaLabel = 'Thread subject') {
  return {
    ariaLabel,
    getAttribute(name) {
      return name === 'aria-label' ? ariaLabel : null;
    },
    querySelector(selector) {
      const prefix = selector.includes('Open in full screen') ? 'Open in full screen' : 'Close ';
      return buttonLabels.some((label) => label.startsWith(prefix)) ? { ariaLabel: prefix } : null;
    }
  };
}

describe('thread header discovery', () => {
  it('finds the semantic header with a native full-screen control', () => {
    const header = createHeader(['Open in full screen']);

    expect(findThreadHeader(createDocument([createHeader(['Archive']), header]))).toBe(header);
  });

  it('recognizes the close control and returns null without either anchor', () => {
    const closeHeader = createHeader(['Close thread']);

    expect(findThreadHeader(createDocument([closeHeader]))).toBe(closeHeader);
    expect(findThreadHeader(createDocument([createHeader(['Archive'])]))).toBeNull();
  });
});
