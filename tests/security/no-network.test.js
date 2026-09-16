import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = process.cwd();
const allowedManifestHosts = ['*://chat.google.com/*', '*://mail.google.com/chat/*'];
const allowedNamespaceUrls = new Set([
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/XML/1998/namespace',
  'http://www.w3.org/1998/Math/MathML'
]);
const allowedDependencyUrls = [
  /^https:\/\/reactjs\.org\/docs\/error-decoder\.html\?invariant=/,
  /^https:\/\/tinyurl\.com\/y2uuvskb$/,
  /^http:\/\/bit\.ly\/2kdckMn$/
];

function extensionCodeFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return extensionCodeFiles(path);
    return /\.(?:js|jsx|css)$/.test(entry.name) ? [path] : [];
  });
}

function extensionSources({ includeDist = false } = {}) {
  const directories = [resolve(projectRoot, 'src')];
  if (includeDist) directories.push(resolve(projectRoot, 'dist'));
  return [
    ...directories.flatMap(extensionCodeFiles)
  ];
}

function readSources(options) {
  return extensionSources(options).map((path) => ({ path, source: readFileSync(path, 'utf8') }));
}

function isAllowedUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (allowedNamespaceUrls.has(rawUrl) || allowedDependencyUrls.some((pattern) => pattern.test(rawUrl))) return true;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.hostname === 'chat.google.com') return true;
  return url.hostname === 'mail.google.com' && /^\/chat\//.test(url.pathname);
}

describe('extension network boundary', () => {
  it('contains no network APIs, analytics SDKs, or sync storage', () => {
    const forbiddenInSourceAndBuild = [
      /\bfetch\s*\(/i,
      /\bXMLHttpRequest\b/i,
      /\bWebSocket\b/i,
      /\bsendBeacon\b/i,
      /\bchrome\s*\.\s*storage\s*\.\s*sync\b/i
    ];
    const forbiddenAnalyticsInSource = [
      /\bgtag\b/i,
      /\bga\s*\(/i,
      /\bGoogle\s+Analytics\b/i,
      /\bGoogle\s+Tag\s+Manager\b/i,
      /\banalytics(?:\.js)?\b/i,
      /\bdataLayer\b/i,
      /\bsegment(?:\.io)?\b/i,
      /\bamplitude\b/i,
      /\bmixpanel\b/i,
      /\bposthog\b/i,
      /\bplausible\b/i,
      /\bhotjar\b/i,
      /\bmatomo\b/i,
      /\bsentry\b/i,
      /\bheap\b/i,
      /\bfullstory\b/i,
      /\bclarity\b/i,
      /\brudderstack\b/i,
      /\bnewrelic\b/i,
    ];

    for (const { path, source } of readSources({ includeDist: true })) {
      for (const pattern of forbiddenInSourceAndBuild) {
        expect(source, `${path} matches ${pattern}`).not.toMatch(pattern);
      }
    }
    for (const { path, source } of readSources()) {
      for (const pattern of forbiddenAnalyticsInSource) {
        expect(source, `${path} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('contains only allowed external URLs in extension code', () => {
    const urlPattern = /\b(?:https?|wss?|ftp):\/\/[^\s"'<>()[\]{}]+/gi;
    const violations = [];

    for (const { path, source } of readSources({ includeDist: true })) {
      for (const rawUrl of source.match(urlPattern) || []) {
        const url = rawUrl.replace(/[.,;:]+$/, '');
        try {
          if (!isAllowedUrl(url)) violations.push(`${path}: ${url}`);
        } catch {
          violations.push(`${path}: ${url}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('limits manifest host permissions and content matches to Chat and Gmail Chat', () => {
    const manifest = JSON.parse(readFileSync(resolve(projectRoot, 'public/manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toEqual(allowedManifestHosts);

    const matches = (manifest.content_scripts || []).flatMap((entry) => entry.matches || []).sort();
    expect(matches).toEqual([...allowedManifestHosts, ...allowedManifestHosts].sort());
  });
});
