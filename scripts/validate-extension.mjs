import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('extension');
const manifestPath = resolve(root, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.manifest_version !== 3) throw new Error('extension must use Manifest V3');
if (manifest.background?.service_worker !== 'background/service-worker.js') throw new Error('unexpected service worker path');
if (manifest.action?.default_popup !== 'popup/popup.html') throw new Error('unexpected popup path');

const required = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...(manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []),
];

for (const relative of required) {
  try {
    await access(resolve(root, relative));
  } catch {
    throw new Error(`manifest references missing file: ${relative}`);
  }
}

if (!manifest.host_permissions?.includes('<all_urls>')) {
  throw new Error('extension must declare <all_urls> host permission for the current MVP');
}

for (const script of manifest.content_scripts ?? []) {
  if (script.all_frames !== true) throw new Error('content script must run in all frames');
}

console.log(`extension manifest OK (${required.length} referenced files checked)`);
