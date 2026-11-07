import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { register, cpanelProvider } from '../src/index';
import { cpanelLinkOf } from '../src/lib/link';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

test('the package requires nothing outside itself', () => {
  for (const f of ['src/index.ts', 'src/lib/link.ts', 'src/lib/provider.ts']) {
    const src = fs.readFileSync(path.join(PKG, f), 'utf8');
    assert.doesNotMatch(src, /from ['"]\.\.\/\.\./, `${f} reaches outside the package`);
  }
});

test('the manifest says what the installer has to place, and every named file ships', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  const m = pkg.workspacePlugin;
  assert.strictEqual(m.name, 'cpanel');
  const files: string[] = [m.settingsTemplate, m.labels, ...m.commands.files, ...m.scripts.functions, ...m.scripts.args, m.scripts.hostInstall, ...((m.ddev && m.ddev.compose) || []), ...(m.features || [])];
  for (const f of files) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  for (const folder of pkg.files) assert.ok(fs.existsSync(path.join(PKG, folder)) || folder.startsWith('dist'), `${folder} exists`);
});

test('a project is linked when .cpanel/workspace.yml names an id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpanel-'));
  const p = path.join(dir, 'site1');
  fs.mkdirSync(path.join(p, '.cpanel'), { recursive: true });
  fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  fs.writeFileSync(path.join(p, '.cpanel', 'workspace.yml'), 'id: example.com\nenv: example.com\nregion: eu-1\n');
  fs.writeFileSync(path.join(p, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  const u = cpanelLinkOf(p);
  assert.strictEqual(u.id, 'example.com');
  assert.strictEqual(u.env, 'example.com');
  assert.strictEqual(u.branch, 'main');
  assert.strictEqual(u.fields.region, 'eu-1');
  assert.strictEqual(cpanelLinkOf(path.join(dir, 'nope')), null);
});

function fakeApi(root: string) {
  const calls: any = { rowMenus: {}, chips: [], actions: {}, fragments: [], pages: [], setups: [], css: [] };
  const api: any = {
    name: 'cpanel', config: {},
    settings: { file: 'plugin.cpanel.settings.yml', read: () => ({ api_tokens: 'CHANGE_ME', ssh_key: 'CHANGE_ME' }), set() {}, setList() {} },
    lib: {
      esc: (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)),
      ROOT: root, workspaceDir: (ws: string) => path.join(root, ws), listProjects: (dir: string) => fs.readdirSync(dir),
      isValidWorkspace: (ws: string) => /^[a-z0-9_-]+$/.test(ws), screenAction: () => {}, iconHtml: (n: string) => `<i data-icon="${n}"></i>`,
      NAME_RE: /^[a-zA-Z0-9_-]+$/, run: async () => ({ ok: false, code: 1, stdout: '', stderr: '' }), startInScreen: async () => ({ ok: true }),
      screenStartedHtml: () => '', cliError: (s: string) => s, commandBlock: () => '',
    },
    addRowMenu: (slot: string, spec: any, fn: any) => { calls.rowMenus[slot] = { spec, fn }; },
    addProjectChip: (fn: any) => calls.chips.push(fn), addAction: (name: string, fn: any) => { calls.actions[name] = fn; },
    addFragment: (fn: any) => calls.fragments.push(fn), addPage: (re: RegExp, fn: any) => calls.pages.push({ re, fn }),
    addFolderSetup: (s: any) => calls.setups.push(s), addCss: (f: string) => calls.css.push(f),
  };
  return { api, calls };
}

test('register() asks for the hosting surface under the cpanel slot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpanel-ws-'));
  fs.mkdirSync(path.join(root, 'dev', 'site1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'dev', 'cmd-tools-cpanel.sh'), '#!/usr/bin/env bash\n');
  const { api, calls } = fakeApi(root);
  register(api);
  assert.deepStrictEqual(Object.keys(calls.rowMenus), ['cpanel']);
  assert.deepStrictEqual(calls.rowMenus.cpanel.spec, { label: 'CPANEL', row: 0 });
  assert.ok(calls.actions['tool-status'] && calls.actions.envs, 'the status verb and the environments modal');
  assert.ok(calls.pages[0].re.test('/cpanel-site/dev/site1'));
  const ctx: any = { key: 'dev', project: 'site1', dir: path.join(root, 'dev'), meta: {}, vals: () => "hx-vals='{}'" };
  const html = calls.rowMenus.cpanel.fn({ ...ctx, allowed: new Set(['cpanel']) });
  assert.match(html, /CPANEL/);
  assert.match(html, /not linked/);
  assert.match(html, /cmd-tools-cpanel\.sh site1 --link/);
  assert.strictEqual(calls.rowMenus.cpanel.fn({ ...ctx, allowed: new Set(['ddev']) }), null);
});

test('the provider: id, script, verbs, token gate and console', () => {
  const p = cpanelProvider(fakeApi(os.tmpdir()).api);
  assert.strictEqual(p.id, 'cpanel');
  assert.strictEqual(p.script, 'cmd-tools-cpanel.sh');
  assert.ok(p.tools.status, 'a status verb');
  assert.ok(p.tools.deploy, 'a deploy verb');
  assert.ok(p.tools.logs, 'a logs verb');
  assert.strictEqual(p.jobEnv(), null, 'CHANGE_ME is no credential');
  assert.match(String(p.consoleUrl({ id: 'example.com', fields: { host: 'srv.example.com' } } as any)), /^https:\/\//);
});
