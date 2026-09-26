// Sanity-checks manifest.json: valid JSON, MV3, module service worker, and
// every referenced file exists. Run: npm run check
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
} catch (err) {
  console.error(`manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
if (manifest.background?.type !== 'module') problems.push('background.type must be "module"');
if (typeof manifest.background?.service_worker !== 'string') problems.push('background.service_worker missing');
if (manifest.action?.default_popup) problems.push('action.default_popup must not be set (click saves immediately)');
if (!manifest.commands?.['save-page']) problems.push('commands.save-page missing');
if (manifest.content_scripts) problems.push('content_scripts must not be present');

const expectedPermissions = ['activeTab', 'storage', 'notifications'];
const expectedHosts = ['https://arxiv.org/*', 'https://export.arxiv.org/*', 'http://127.0.0.1/*', 'https://127.0.0.1/*'];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
if (!same(manifest.permissions ?? [], expectedPermissions)) problems.push(`permissions must be exactly ${expectedPermissions.join(', ')}`);
if (!same(manifest.host_permissions ?? [], expectedHosts)) problems.push(`host_permissions must be exactly ${expectedHosts.join(', ')}`);

const files = [
  manifest.background?.service_worker,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
].filter(Boolean);
for (const file of new Set(files)) {
  if (!existsSync(join(ROOT, file))) problems.push(`referenced file missing: ${file}`);
}

if (problems.length) {
  for (const p of problems) console.error(`manifest: ${p}`);
  process.exit(1);
}
console.log(`manifest.json OK (${new Set(files).size} referenced files present)`);
