import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('extension manifest', () => {
  it('keeps the content script explicitly isolated from the MAIN-world bridge', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'));
    const contentEntry = manifest.content_scripts.find((entry) => entry.js.includes('content.js'));

    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(contentEntry).toMatchObject({ run_at: 'document_idle', world: 'ISOLATED' });
  });
});
