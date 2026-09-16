import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve('dist');
const requiredFiles = ['manifest.json', 'background.js', 'content.js', 'page-bridge.js'];

for (const file of requiredFiles) {
  await access(resolve(dist, file));
}

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.json'), 'utf8'));
if (manifest.background?.service_worker !== 'background.js' || manifest.background?.type !== 'module') {
  throw new Error('dist/manifest.json is missing the module background service worker registration');
}
const scripts = manifest.content_scripts ?? [];
const bridgeEntry = scripts.find((entry) => entry.js?.includes('page-bridge.js'));
const contentEntry = scripts.find((entry) => entry.js?.includes('content.js'));
if (!bridgeEntry || bridgeEntry.world !== 'MAIN' || bridgeEntry.run_at !== 'document_start') {
  throw new Error('dist/manifest.json is missing the document_start MAIN page bridge entry');
}
if (!contentEntry || contentEntry.run_at !== 'document_idle' || contentEntry.world !== 'ISOLATED') {
  throw new Error('dist/manifest.json is missing the document_idle isolated content entry');
}

const bridge = await readFile(resolve(dist, 'page-bridge.js'), 'utf8');
if (/\bimport\s*(?:["'{*]|[A-Za-z_$])/.test(bridge)) {
  throw new Error('dist/page-bridge.js must be standalone and contain no ES imports');
}
