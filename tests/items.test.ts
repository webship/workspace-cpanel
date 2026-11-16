/**
 * The AI items this plugin carries (ai/ in the package, the manifest's `ai` block), each placed by the
 * installer in the workspace folder of its kind.
 *
 * What is checked here is what a person relies on once they are installed: each item has the shape its
 * folder lists, its body is plain Markdown any AI command-line assistant can follow, and it names nothing
 * that does not exist — what it says about the plugin is held to the plugin's own code, scripts and settings.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import * as plugin from '../src/index';

// Compiled, these tests run from dist/tests, so the package root is one folder further up.
const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const read = (f: string) => fs.readFileSync(path.join(PKG, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const manifest = pkg.workspacePlugin;
const P: string = manifest.name;
const { AGENTS, SKILLS, AI_COMMANDS, PROMPTS } = plugin as any;
void os;

// The kinds the workspace knows, and the folder each one lands in (core/workspace-app/plugin-install.js).
const KINDS: Record<string, string> = { agents: 'ai-agents', skills: 'ai-skills', commands: 'ai-commands', prompts: 'ai-prompts' };
const kindList = (kind: string): string[] => manifest.ai[kind] || [];

/** Every file of the package under a path: the file itself, or all the files of a folder (a skill is a folder). */
function filesUnder(rel: string): string[] {
  const abs = path.join(PKG, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs).flatMap((e) => filesUnder(`${rel}/${e}`));
}
const ITEM_FILES: string[] = Object.keys(KINDS).flatMap((kind) => kindList(kind).flatMap(filesUnder));
const MAIN_FILES: string[] = [...kindList('agents'), ...kindList('commands'), ...kindList('prompts'), ...kindList('skills').map((s) => `${s}/SKILL.md`)];
const frontmatter = (src: string) => (src.startsWith('---\n') ? src.split('\n---\n')[0] : '');
const bodyOf = (src: string) => (src.startsWith('---\n') ? src.split('\n---\n').slice(1).join('\n---\n') : src);
// The plugins the manifest needs: a list alone, or the `plugins` of the object that also carries the commands.
const neededPlugins: unknown[] = Array.isArray(manifest.needs) ? manifest.needs : ((manifest.needs && manifest.needs.plugins) || []);
// The sources of the plugin: what an item may be held to.
const walk = (dir: string): string[] => (fs.existsSync(path.join(PKG, dir)) ? fs.readdirSync(path.join(PKG, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`])) : []);
const SOURCES: string = ['src', 'scripts', 'commands', 'lib'].flatMap(walk).map(read).join('\n');
void SOURCES;

test('the manifest carries a list per kind it ships, each item under ai/<kind>/, and needs the folder each kind lands in', () => {
  assert.deepStrictEqual(Object.keys(manifest.ai).sort(), CFG.kinds.slice().sort(), 'the kinds this plugin ships');
  for (const kind of CFG.kinds) {
    const list = kindList(kind);
    assert.ok(list.length > 0, `the plugin ships at least one of ${kind}`);
    for (const f of list) {
      assert.strictEqual(path.dirname(f), `ai/${kind}`, `${f} is in ai/${kind}/`);
      assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
      assert.match(path.basename(f), new RegExp(`^${(CFG as any).prefix || P}-[a-z0-9-]+(\\.md)?$`), `${f} carries the plugin's name, so it never takes the name of another plugin's item`);
    }
    assert.ok(neededPlugins.includes(KINDS[kind]), `it ships ${kind}, so it needs ${KINDS[kind]}`);
  }
  assert.ok(pkg.files.includes('ai'), 'ai/ is published with the package');
  const names = (kind: string, ext = '.md') => kindList(kind).map((f: string) => path.basename(f, ext));
  assert.deepStrictEqual(names('agents'), AGENTS);
  assert.deepStrictEqual(names('skills', ''), SKILLS);
  assert.deepStrictEqual(names('commands'), AI_COMMANDS);
  assert.deepStrictEqual(names('prompts'), PROMPTS);
  // Commands and prompts share one destination when they are installed: a name used by both is lost.
  assert.strictEqual(new Set([...AI_COMMANDS, ...PROMPTS]).size, AI_COMMANDS.length + PROMPTS.length, 'no command and prompt share a name');
});

test('an agent is named after its file, says when to use it, and names its model and tools', () => {
  for (const f of kindList('agents')) {
    const head = frontmatter(read(f));
    assert.match(head, new RegExp(`^name: ${path.basename(f, '.md')}$`, 'm'));
    assert.match(head, /^description: Use this agent .{80,}$/m, `${f} says what it does and when to use it`);
    assert.match(head, /^model: fable$/m);
    assert.match(head, /^tools:\n( {2}- \S+\n?)+/m, `${f} lists its tools`);
  }
});

test('a skill is a folder with a SKILL.md named after it, and says when to use it', () => {
  for (const f of kindList('skills')) {
    assert.ok(fs.statSync(path.join(PKG, f)).isDirectory(), `${f} is a folder`);
    const head = frontmatter(read(`${f}/SKILL.md`));
    assert.match(head, new RegExp(`^name: ${path.basename(f)}$`, 'm'));
    assert.match(head, /^description: .{80,}$/m, `${f} says what it does and when to use it`);
    assert.match(head, /Use when/, `${f} names the requests it answers to`);
  }
});

test('a command is a slash command: a description, an argument hint, $ARGUMENTS, and the arguments said in words', () => {
  for (const f of kindList('commands')) {
    const src = read(f);
    const head = frontmatter(src);
    assert.match(head, /^description: .{40,}$/m, `${f} is described in the command list`);
    assert.match(head, /^argument-hint: .+$/m, `${f} says what to type after it`);
    assert.doesNotMatch(head, /^name:/m, `${f} is named by its file`);
    assert.ok(src.includes('$ARGUMENTS'), `${f} reads what was typed after the command`);
    assert.match(bodyOf(src), /The (first word|argument) is /, `${f} says in words what the arguments are, for an assistant that does not fill $ARGUMENTS in`);
  }
});

test('a prompt is a line that says what it is for, then the whole launch command, and says the text works in another AI assistant', () => {
  for (const f of kindList('prompts')) {
    const src = read(f);
    assert.doesNotMatch(src, /^---\n/, `${f} has no frontmatter: it is not installed as a command`);
    assert.match(src.split('\n')[0], /^[A-Z].{20,}\.$/, `${f} opens with one sentence`);
    // The two expressions the dashboard reads a prompt with (core/workspace-app/screens.js).
    const flags = src.match(/^\s*claude\s+([^\n]*?)\s*"""\s*$/m);
    const text = src.match(/claude[^\n]*"""\n([\s\S]*?)\n"""/);
    assert.ok(flags && flags[1].trim() === '--permission-mode bypassPermissions', `${f} carries the default launch command`);
    assert.ok(text && text[1].trim().length > 100, `${f} carries the prompt`);
    assert.match(text![1], /<[a-z|]+>/, `${f} has placeholders to fill in`);
    assert.match(text![1], /^# .*container-based \(DDEV by default\)/m, `${f} says where it runs`);
    assert.match(src, /^The text between the triple quotes is plain: it can be given to another AI command-line assistant as it is\.$/m, `${f} says its text is not tied to one assistant`);
  }
});

// The book's folder is a path, not an assistant: webship/webship-js-ai-agent, webship/webship-js-skills and
// webship/ai-agents install the book in <root>/.claude/automated-functional-testing-recipes/ for every AI CLI (Codex,
// Gemini and Copilot too). An item may give that folder; nothing else of one assistant.
const BOOK_FOLDER = /(?:~\/)?\.claude\/automated-functional-testing-recipes\//g;

test('the body of every item is plain Markdown: it names no tool or feature of one AI command-line assistant', () => {
  for (const f of ITEM_FILES.filter((x) => x.endsWith('.md'))) {
    // What is left once the default launch line of a prompt is taken out: the words an assistant is asked to follow.
    const body = bodyOf(read(f)).replace(/^\s*claude --permission-mode bypassPermissions """\s*$/m, '').replace(BOOK_FOLDER, '');
    for (const m of body.matchAll(/\b(Bash|Read|Write|Edit|Grep|Glob|Task|Agent|Skill|TodoWrite|WebFetch) tool\b|\bsubagents?\b|bypassPermissions|\bClaude\b|\bclaude -p\b|\.claude\/|\bMCP\b|mcp__/g)) {
      assert.fail(`${f}: "${m[0]}" belongs to one AI assistant; the body is for any of them`);
    }
  }
});

// ---- What is specific to this plugin ---------------------------------------------------------------
const ARGS = read(`scripts/args/arg-${P}.sh`);
const FLAGS: string[] = [...ARGS.matchAll(/'(--[a-z][a-z-]*)'/g)].map((m) => m[1]);
const provider = (plugin as any)[`${P}Provider`]({ name: P, settings: { read: () => ({}), file: manifest.settingsFile }, lib: {} });
provider.pull = provider.pull || {};
const SCRIPT: string = provider.script;
const FIX = JSON.parse(read('tests/fixtures/items-provider.json')) as { follow: string[] };
const CFG = {
  kinds: ['agents', 'skills', 'commands', 'prompts'],
  pluginCommands: { [SCRIPT]: FLAGS } as Record<string, string[]>,      // the options of the command, from its own argparse
  worksWith: new RegExp(SCRIPT.replace(/\./g, '\\.')),
  addresses: /@example\.(com|org)$|^[a-z]+@(host|server):?$|^user@host$/,
  checkpoints: [] as string[],
};
const SKILL = `ai/skills/${P}-hosting/SKILL.md`;
const line = (args: string[]) => `bash ${SCRIPT} <project>${args.length ? ` ${args.join(' ')}` : ''}`;

test('the tables of the skill are the provider: every entry of the menu with its command, every option of the command', () => {
  const skill = read(SKILL);
  const rows = [...skill.matchAll(/^\| \*\*([^*]+)\*\* \| `([^`]+)` \|$/gm)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(rows, Object.values(provider.tools as Record<string, any>).map((t) => [t.label, line(t.args)]), 'the tools of the provider, in its order');
  const options = [...skill.matchAll(/^\| `(--[a-z-]+)(?: <value>)?` \| .+ \|$/gm)].map((m) => m[1]);
  assert.deepStrictEqual(options, FLAGS, 'every option of the argparse, in its order');
  assert.ok(skill.includes(`The ${provider.label} menu`), 'the menu by its label');
  assert.ok(skill.includes(`"${provider.menuNote}"`), 'the note the menu ends with');
  assert.ok(skill.includes(provider.linkHint('<project>')), 'the line that links a project');
  assert.ok(skill.includes(provider.tokenHint), 'where the credential is');
  if (provider.pull.db) assert.ok(skill.includes(line(provider.pull.dbArgs('<environment>'))), 'the database pull');
  if (provider.pull.files) assert.ok(skill.includes(line(provider.pull.filesArgs('<environment>'))), 'the files pull');
  const fun = SOURCES;
  for (const said of ['not linked', 'No such project', 'Not linked to']) assert.ok(fun.includes(said), `the command says "${said}"`);
});

test('a deploy is never a step an item takes; a command and a prompt only read', () => {
  const changes = ['--push', '--link', '--select', '--pull-db', '--pull-files', '--force', '--no-safety-backup', '--database', '--files-bucket'];
  const waits = Object.entries(provider.tools as Record<string, any>).filter(([k]) => FIX.follow.includes(k)).flatMap(([, t]) => t.args as string[]);
  for (const f of MAIN_FILES) {
    let fenced = false;
    let section = '';
    for (const raw of read(f).split('\n')) {
      if (/^\s*```/.test(raw)) { fenced = !fenced; continue; }
      if (/^## /.test(raw)) section = raw;
      const text = raw.trim().replace(/^\d+\.\s+/, '').replace(/^cd ~\/workspace\/<folder> && /, '');
      if (!text.startsWith(`bash ${SCRIPT}`) || !(fenced || f.startsWith('ai/prompts/'))) continue;
      const used: string[] = text.match(/(?<![\w-])--[a-z][a-z-]*/g) || [];
      if (used.includes('--push')) {
        assert.ok(f.startsWith('ai/agents/') ? /Hand over, never run/.test(section) : f.startsWith('ai/prompts/') && raw.startsWith('cd ~/workspace/<folder> && '), `${f}: "${text}" deploys`);
      }
      if (f.startsWith('ai/commands/') || (f.startsWith('ai/prompts/') && !used.includes('--push'))) {
        for (const flag of used) assert.ok(!changes.includes(flag) && !waits.includes(flag), `${f}: "${text}" changes something, or waits`);
      }
      if (f.startsWith('ai/agents/') && used.some((u) => waits.includes(u))) assert.match(section + read(f), /follows a log until it is interrupted/, `${f}: "${text}" waits for a person`);
      assert.ok(!used.includes('--force') && !used.includes('--no-safety-backup'), `${f}: "${text}" is never a line an item shows to run`);
    }
  }
  for (const f of [...kindList('agents'), ...kindList('prompts')]) {
    assert.match(read(f), /[Nn]ever deploys on its own|do not deploy/, `${f}: the deploy is the person's`);
    assert.match(read(f), /[Nn]ever print/, `${f}: no token is printed`);
  }
});

// The workspace's own commands an item may name (github.com/webship/workspace), with the flags it may give them.
const CORE_COMMANDS: Record<string, string[]> = {
  'cmd-tools-testing.sh': ['--run', '--path', '--tags', '--dry-run'],
  'cmd-tools-remove.sh': [],
};
const PLUGINS_SH = ['--list', '--require', '--activate', '--install', '--configure', '--deactivate', '--uninstall', '--check', '--with-needs'];

test('every workspace command an item names exists, with the flags it is given', () => {
  const own: string[] = ((manifest.commands && manifest.commands.files) || []).map((f: string) => path.basename(f));
  assert.deepStrictEqual(own.sort(), Object.keys(CFG.pluginCommands).sort(), 'the cmd-*.sh this plugin places');
  const known: Record<string, string[]> = { ...CORE_COMMANDS, ...CFG.pluginCommands };
  let used = 0;
  // The README of a plugin whose command runs other commands shows them as examples: there, only the items are held to the list.
  for (const f of [...ITEM_FILES, ...((CFG as any).readmeShowsOtherCommands ? [] : ['README.md'])]) {
    for (const line of read(f).split('\n')) {
      for (const m of line.matchAll(/(cmd-[a-z0-9<>-]+\.sh)((?:(?!cmd-)[^`|#;])*)/g)) {
        assert.ok(known[m[1]], `${f}: ${m[1]} is not a command of the plugin or of the workspace`);
        for (const flag of m[2].match(/(?<![\w-])--[a-z][a-z-]*/g) || []) assert.ok(known[m[1]].includes(flag), `${f}: ${m[1]} has no ${flag}`);
        used += 1;
      }
      for (const m of line.matchAll(/plugins\.sh((?:[^`|#;])*)/g)) {
        for (const flag of m[1].match(/(?<![\w-])--[a-z][a-z-]*/g) || []) assert.ok(PLUGINS_SH.includes(flag), `${f}: plugins.sh has no ${flag}`);
        used += 1;
      }
    }
  }
  assert.ok(used > 3, 'the items show the workspace commands');
});

test('every settings key an item names is in the settings template, and the skill describes every key of it', () => {
  if (!manifest.settingsTemplate) {
    for (const f of MAIN_FILES) assert.doesNotMatch(read(f), /core\/config\/plugin\.[a-z-]+\.settings\.yml/, `${f}: this plugin has no settings file`);
    return;
  }
  const template = read(manifest.settingsTemplate);
  const keys = [...new Set([...template.matchAll(/^\s*([a-z][a-z0-9_]*):/gm)].map((m) => m[1]))];
  assert.ok(keys.length > 0);
  const named = new Set<string>();
  for (const f of MAIN_FILES) {
    for (const m of read(f).matchAll(/`([a-z][a-z0-9_]*):`/g)) {
      assert.ok(keys.includes(m[1]), `${f}: ${manifest.settingsFile} has no key ${m[1]}`);
      named.add(m[1]);
    }
  }
  assert.deepStrictEqual([...named].sort(), [...keys].sort(), 'the items describe every key of the template');
  assert.ok(kindList('skills').some((s) => read(`${s}/SKILL.md`).includes(`core/config/${manifest.settingsFile}`)), 'the skill says which file the keys are in');
});

test('the items say container-based, name the plugin they come with, and carry no personal value', () => {
  for (const f of ITEM_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /DDEV-only/i, `${f}: the workspace is container-based, DDEV by default`);
    assert.doesNotMatch(src, /\/home\/(?!YOUR_USER|user\/)[a-z]/, `${f} carries no personal path`);
    for (const m of src.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[a-z]{2,}/g) || []) assert.match(m, CFG.addresses, `${f}: ${m} is not an example address`);
    assert.doesNotMatch(src, /CHANGE_ME|gh[pousr]_[A-Za-z0-9]{8,}|github_pat_|glpat-[A-Za-z0-9_-]{8,}|ATATT[A-Za-z0-9]/, `${f} carries no token and no placeholder of one`);
  }
  for (const f of MAIN_FILES) {
    assert.match(read(f).replace(/\s+/g, ' '), /container-based (workspace )?\(DDEV by default\)|container-based, DDEV by default/, `${f} says what the workspace runs on`);
    assert.match(read(f), CFG.worksWith, `${f} names what the plugin works with`);
    assert.ok(read(f).includes(pkg.name) || f.startsWith('ai/prompts/'), `${f} says which plugin it comes with`);
  }
  for (const f of CFG.checkpoints) {
    assert.match(read(f), /Reviewed by a human/, `${f} carries the Checkpoints rule`);
    assert.match(read(f), /[Nn]ever tick/, `${f}: the two human-review boxes are never ticked by an assistant`);
  }
  const readme = read('README.md');
  for (const name of [...AGENTS, ...SKILLS, ...AI_COMMANDS, ...PROMPTS]) assert.ok(readme.includes(name), `the README lists ${name}`);
});

// Other AI command-line assistants read the frontmatter with a strict YAML parser: a value such a parser
// cannot read is lost there (the item arrives with an empty description). The default assistant is lenient,
// so the items are held to the strict reading here.
test('the frontmatter of every item is YAML a strict parser reads', () => {
  const ai = JSON.parse(read('package.json')).workspacePlugin.ai || {};
  const files: string[] = [...(ai.agents || []), ...(ai.commands || []), ...(ai.skills || []).map((s: string) => `${s}/SKILL.md`)];
  let seen = 0;
  for (const f of files) {
    const head = frontmatter(read(f));
    assert.ok(head, `${f} has frontmatter`);
    for (const line of head.split('\n').slice(1)) {
      const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?: (.*))?$/);
      if (!m) {
        assert.match(line, /^ +(- )?\S/, `${f}: "${line}" is neither a key nor a part of the key above it`);
        continue;
      }
      const value = (m[2] || '').trim();
      seen += 1;
      if (value === '') continue; // a list follows
      if (value.startsWith("'")) { assert.match(value, /^'(?:[^']|'')*'$/, `${f}: the value of ${m[1]} is not a closed single-quoted value`); continue; }
      if (value.startsWith('"')) { assert.doesNotThrow(() => JSON.parse(value), `${f}: the value of ${m[1]} is not a closed double-quoted value`); continue; }
      if (/^\[.*\]$/.test(value)) continue; // a list on one line
      assert.doesNotMatch(value, /: |:$| #/, `${f}: the value of ${m[1]} holds ": " or " #". A strict YAML parser stops there, and the assistant that uses one gets no ${m[1]}: reword it, or quote the value`);
      assert.doesNotMatch(value, /^(?:[[\]{}>|*&!%@\`#,]|[-?:] )/, `${f}: the value of ${m[1]} starts with a sign YAML keeps for itself: quote the value`);
    }
  }
  assert.ok(seen > 0, 'the items carry frontmatter');
});

// When the work touches automated functional testing, the items send the reader to the book Automated Functional
// Testing Recipes first: every agent and skill carries the same section "The book", the tester and the scenarios
// skill of a platform also name the chapters to start with, and a command or a prompt that runs the suite points to it.
const BOOK_WHERE = [
  '.claude/automated-functional-testing-recipes/',
  '~/.claude/automated-functional-testing-recipes/',
  'https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes',
];
test('the items point to the book Automated Functional Testing Recipes, and say where to find it, in order', () => {
  const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
  const inOrder = (f: string, text: string) => {
    let at = -1;
    for (const where of BOOK_WHERE) {
      const next = text.indexOf(where, at + 1);
      assert.ok(next > at, `${f} gives ${where}, after the place before it`);
      at = next;
    }
  };
  const platform = (manifest.ai.skills || []).some((s: string) => path.basename(s) === `${manifest.name}-scenarios`);
  const sections = new Set<string>();
  const chapters = new Set<string>();
  for (const f of [...(manifest.ai.agents || []), ...(manifest.ai.skills || []).map((s: string) => `${s}/SKILL.md`)]) {
    const src = read(f);
    const start = src.indexOf('\n## The book\n');
    assert.ok(start > 0, `${f} has the section "The book"`);
    const rest = src.slice(start + 1);
    const end = rest.indexOf('\n## ', 1);
    const [base, startWith] = (end < 0 ? rest : rest.slice(0, end)).split('\n- **For ');
    assert.ok(flat(base).includes('read the book *Automated Functional Testing Recipes* first.'), `${f} says to read the book first`);
    inOrder(f, base);
    assert.ok(flat(base).includes('Its `README.md` first, then the chapter that matches the task'), `${f} says how to read it`);
    assert.ok(flat(base).includes('source of truth for step phrasing. When they differ from the book, follow them and say so.'), `${f} says what wins over the book`);
    sections.add(flat(base));
    const item = path.basename(f) === 'SKILL.md' ? path.basename(path.dirname(f)) : path.basename(f, '.md');
    if (platform && [`${manifest.name}-tester`, `${manifest.name}-scenarios`].includes(item)) {
      const named = (startWith || '').match(/`ch\d{2}-[a-z0-9-]+\.md`/g) || [];
      assert.ok(named.length >= 2 && named.length <= 4, `${f} names two to four chapters to start with`);
      chapters.add(named.join(' '));
    } else {
      assert.strictEqual(startWith, undefined, `${f}: only the tester and the scenarios skill of a platform name chapters`);
    }
  }
  assert.strictEqual(sections.size, 1, 'the section is the same in every agent and skill');
  assert.ok(chapters.size <= 1, 'the tester and the scenarios skill name the same chapters');
  for (const f of [...(manifest.ai.commands || []), ...(manifest.ai.prompts || [])]) {
    const src = read(f);
    if (!src.includes('cmd-tools-testing.sh')) continue;
    assert.ok(/the book \*?Automated Functional Testing Recipes/.test(flat(src)), `${f} runs the suite, so it points to the book`);
    inOrder(f, src);
  }
});
