/**
 * The settings form explains the token entry, and nothing the package ships names an account (#27).
 *
 * The form labelled the placeholder entry of `api_tokens` "CHANGE_ME_USER" and described it with the template's
 * commented-out example, "webshipco: CHANGE_ME"; the examples named that one real cPanel account.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(path.join(PKG, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

test('the placeholder token entry is explained by its label and by the comment above it', () => {
  // The labels file is flat YAML: a key at the margin, then its indented label and info.
  const labels = read('config/settings.labels.yml');
  const block = labels.slice(labels.indexOf('\napi_tokens.CHANGE_ME_USER:\n'));
  assert.ok(block.length > 1 && labels.includes('\napi_tokens.CHANGE_ME_USER:\n'), 'the entry has a label');
  assert.match(block, /^  label: .*cPanel user/m);
  assert.match(block, /^  info: .*its user then its API token.*Raw YAML/m);
  const template = read('config/plugin.cpanel.settings.yml');
  const above = template.split('\n')[template.split('\n').findIndex((l) => /^\s+CHANGE_ME_USER:/.test(l)) - 1];
  assert.match(above, /^\s+# One line per cPanel account/, 'the comment the form shows when it has no label of its own');
  assert.doesNotMatch(template, /^\s+#\s*[\w.-]+:\s*CHANGE_ME\s*$/m, 'no commented-out entry for the form to show as a description');
});

test('nothing the package ships names a real account', () => {
  const pkg = JSON.parse(read('package.json'));
  const files = (pkg.files as string[]).filter((f) => f !== 'dist/src').flatMap((f) => (fs.statSync(path.join(PKG, f)).isDirectory() ? walk(f) : [f]));
  for (const f of [...files, 'src/lib/provider.ts']) assert.doesNotMatch(read(f), /webshipco/i, f);
});
