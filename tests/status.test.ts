/**
 * The status of a linked project for someone without the account's API token, or without an answer:
 * `cmd-tools-cpanel.sh <project>`, the menu's "Link and domains" (and every verb that ends in it). It
 * shows the link, says once what is missing and how to fix it, prints no Python traceback and no
 * "command not found", and fails. `--environments` and `--select` need the token too: without it they
 * say so, and --select no longer blames the domain it was given. The SSH verbs do not need it.
 *
 * The hooks run here as the command runs them, in a temp workspace whose PATH holds only the basic
 * tools and the stand-ins a test gives (ssh, rsync and curl that reach nothing). Nothing leaves it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const HOOKS = ['scripts/functions/fun-cpanel.sh', 'scripts/functions/fun-cpanel-tool.sh'].map((f) => path.join(PKG, f));
const TOKEN_SENTENCE = 'No API token for cPanel user site1user: add site1user: <token> under api_tokens in core/config/plugin.cpanel.settings.yml';

/** This machine's own copy of a tool, from its PATH. */
function which(tool: string): string | null {
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    const f = path.join(dir, tool);
    try { if (fs.statSync(f).isFile()) { fs.accessSync(f, fs.constants.X_OK); return f; } } catch (_) { /* not here */ }
  }
  return null;
}
const BASIC = ['bash', 'python3', 'grep', 'sed', 'head', 'tail', 'awk', 'tr', 'cat', 'dirname', 'mkdir', 'touch', 'date', 'mktemp', 'find'];
const skip = ['bash', 'python3', 'grep', 'sed', 'head'].every((t) => which(t)) ? false : 'bash, python3, grep, sed or head is not here';

/** ssh, rsync and curl that reach nothing; curl writes down what it was asked (@ROOT@ is the workspace). */
const OFFLINE: Record<string, string> = {
  ssh: 'echo "ssh: Could not resolve hostname" >&2; exit 255',
  rsync: 'exit 12',
  curl: 'printf "%s\\n" "$@" >> "@ROOT@/curl.calls"; echo "curl: (6) Could not resolve host" >&2; exit 6',
};
const ANSWERING_CURL = `printf "%s\\n" "$@" >> "@ROOT@/curl.calls"; case "$*" in
  *DomainInfo/list_domains*) echo '{"data":{"main_domain":"example.invalid","addon_domains":["shop.example.invalid"],"sub_domains":[],"parked_domains":[]}}' ;;
  *Quota/get_quota_info*) echo '{"data":{"megabytes_used":12,"megabyte_limit":100}}' ;;
  *) exit 6 ;;
esac`;

const temps: string[] = [];
after(() => { for (const d of temps) fs.rmSync(d, { recursive: true, force: true }); });

/** A workspace: core/config with the settings (the template unless given), dev/site1 (linked unless told otherwise), bin/ with the basic tools and the stand-ins. */
function workspace(standIns: Record<string, string> = OFFLINE, { linked = true, settings = '' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cpanel-status-'));
  temps.push(root);
  const bin = path.join(root, 'bin');
  fs.mkdirSync(path.join(root, 'core', 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dev', 'site1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'home'));
  fs.mkdirSync(bin);
  const file = path.join(root, 'core', 'config', 'plugin.cpanel.settings.yml');
  if (settings) fs.writeFileSync(file, settings);
  else fs.copyFileSync(path.join(PKG, 'config', 'plugin.cpanel.settings.yml'), file);
  if (linked) {
    fs.mkdirSync(path.join(root, 'dev', 'site1', '.cpanel'));
    fs.writeFileSync(path.join(root, 'dev', 'site1', '.cpanel', 'workspace.yml'), 'id: site1user@example.invalid\nuser: site1user\nhost: example.invalid\nremote: /home/site1user/public_html\n');
  }
  for (const t of BASIC) { const real = which(t); if (real) fs.symlinkSync(real, path.join(bin, t)); }
  for (const [name, body] of Object.entries(standIns)) fs.writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\n${body.split('@ROOT@').join(root)}\n`, { mode: 0o755 });
  return root;
}

/** What `bash cmd-tools-cpanel.sh site1 [flags]` does once the workspace has loaded: the dispatcher, with the flags argparse would set. */
function run(root: string, flags: Record<string, string> = {}) {
  const r = spawnSync(which('bash') as string, ['-c', `source "${HOOKS[0]}" && source "${HOOKS[1]}" && cpanel_project_tool`], {
    cwd: path.join(root, 'dev'), input: '', encoding: 'utf8',
    env: { PATH: path.join(root, 'bin'), HOME: path.join(root, 'home'), WORKSPACE_ROOT: root, WORKSPACE_CONFIG: path.join(root, 'core', 'config'), doc_name: 'dev', PROJECT_NAME: 'site1', ...flags },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const times = (s: string, needle: string) => s.split(needle).length - 1;
const curlCalls = (root: string) => (fs.existsSync(path.join(root, 'curl.calls')) ? fs.readFileSync(path.join(root, 'curl.calls'), 'utf8') : '');

function clean(out: string) {
  assert.doesNotMatch(out, /Traceback|JSONDecodeError/, `no Python traceback:\n${out}`);
  assert.doesNotMatch(out, /command not found|No such file or directory/, `no shell error:\n${out}`);
}

/** The part of the status known on this machine: the link, the remote and the console. */
function local(out: string) {
  assert.match(out, /linked:\s+site1user@example\.invalid/, 'the link still shows');
  assert.match(out, /remote:\s+\/home\/site1user\/public_html/, 'the remote still shows');
  assert.ok(out.includes('Console: https://example.invalid:2083/'), 'the console still shows');
}

test('without an API token, the status of a linked project shows the link, says once where the token goes, calls nothing, and fails', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root);
  clean(out);
  local(out);
  assert.strictEqual(times(out, TOKEN_SENTENCE), 1, out);
  assert.notStrictEqual(status, 0, 'the account could not be reached');
  assert.strictEqual(curlCalls(root), '', 'no UAPI call without a token');
});

test('a token left at CHANGE_ME is no token', { skip }, () => {
  const root = workspace(OFFLINE, { settings: 'api_tokens:\n  site1user: CHANGE_ME\n' });
  const { status, out } = run(root);
  clean(out);
  assert.strictEqual(times(out, TOKEN_SENTENCE), 1, out);
  assert.notStrictEqual(status, 0);
  assert.strictEqual(curlCalls(root), '');
});

test('--select without a token names the missing token, not the domain', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root, { SELECT: 'example.invalid' });
  clean(out);
  assert.strictEqual(times(out, TOKEN_SENTENCE), 1, out);
  assert.doesNotMatch(out, /has no environment called/);
  assert.notStrictEqual(status, 0);
  assert.strictEqual(curlCalls(root), '');
  assert.ok(!fs.readFileSync(path.join(root, 'dev', 'site1', '.cpanel', 'workspace.yml'), 'utf8').includes('env:'), 'nothing is selected');
});

test('--environments without a token says so once, without a traceback', { skip }, () => {
  const root = workspace();
  const { status, out } = run(root, { ENVIRONMENTS: 'yes' });
  clean(out);
  assert.strictEqual(times(out, TOKEN_SENTENCE), 1, out);
  assert.notStrictEqual(status, 0);
  assert.strictEqual(curlCalls(root), '');
});

test('--logs needs no token; the status after it still says the token is missing, and the run fails', { skip }, () => {
  const { status, out } = run(workspace(), { LOGS: 'yes' });
  clean(out);
  local(out);
  assert.match(out, /ssh: Could not resolve hostname/, 'the log went over SSH');
  assert.strictEqual(times(out, TOKEN_SENTENCE), 1, out);
  assert.notStrictEqual(status, 0);
});

test('without rsync, the status says so once, and fails', { skip }, () => {
  const { ssh, curl } = OFFLINE;
  const { status, out } = run(workspace({ ssh, curl }));
  clean(out);
  local(out);
  assert.strictEqual(times(out, 'rsync is not installed, and the cPanel tool needs it.'), 1, out);
  assert.notStrictEqual(status, 0);
});

test('with a token but no answer from the account, the status says so without a traceback, and fails', { skip }, () => {
  const root = workspace(OFFLINE, { settings: 'api_tokens:\n  site1user: test-token\n' });
  const { status, out } = run(root);
  clean(out);
  local(out);
  assert.match(out, /\(could not list the domains — check the API token and that https:\/\/example\.invalid:2083 answers\)/);
  assert.match(curlCalls(root), /^Authorization: cpanel site1user:test-token$/m, 'the token from the settings file was sent');
  assert.notStrictEqual(status, 0);
});

test('with a token and an answer, the domains are listed and the run succeeds', { skip }, () => {
  const root = workspace({ ...OFFLINE, curl: ANSWERING_CURL }, { settings: 'api_tokens: { site1user: test-token }\n' });
  const { status, out } = run(root);
  clean(out);
  local(out);
  assert.match(out, /example\.invalid\s+main\s+https:\/\/example\.invalid/);
  assert.match(out, /shop\.example\.invalid\s+addon\s+https:\/\/shop\.example\.invalid/);
  assert.match(out, /disk: 12 MB of 100 MB/);
  assert.strictEqual(status, 0, out);
});

test('a project that is not linked shows how to link it, needs no token, and succeeds', { skip }, () => {
  const { status, out } = run(workspace(OFFLINE, { linked: false }));
  clean(out);
  assert.match(out, /not linked\. Link it with:/);
  assert.doesNotMatch(out, /No API token/);
  assert.strictEqual(status, 0, out);
});
