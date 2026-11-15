/**
 * The arguments of the plugin's command (scripts/args/*.sh) are a Python argparse definition, handed
 * to python3 by the workspace's argparse() (core/scripts/libs/argparse.sh). A definition that does
 * not parse stops the command at once, whatever was typed: with no argument, with --help, with a
 * project. This runs the definition the way the workspace does, on its help path.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;

/** The Python between `argparse "$@" <<ARGEOF` and `ARGEOF`: what the workspace puts after its own parser. */
function definitionOf(file: string): string {
  const src = fs.readFileSync(path.join(PKG, file), 'utf8');
  const m = src.match(/argparse "\$@" <<ARGEOF[^\n]*\n([\s\S]*?)\nARGEOF/);
  assert.ok(m, `${file} hands a definition to argparse`);
  return m![1];
}
const python = (definition: string, argv: string[]) => spawnSync('python3', ['-c',
  `import argparse, sys\nparser = argparse.ArgumentParser(prog='cmd')\n${definition}\nargs = parser.parse_args(sys.argv[1:])\nprint('PARSED')\n`, ...argv], { encoding: 'utf8' });
const hasPython = spawnSync('python3', ['--version']).status === 0;

test('the definition of every argument parses, and --help prints every option', { skip: hasPython ? false : 'python3 is not here' }, () => {
  assert.ok(manifest.scripts.args.length > 0);
  for (const file of manifest.scripts.args) {
    const definition = definitionOf(file);
    const help = python(definition, ['--help']);
    assert.doesNotMatch(String(help.stderr), /SyntaxError/, `${file}: ${String(help.stderr).split('\n').slice(0, 4).join(' | ')}`);
    assert.strictEqual(help.status, 0, `${file}: --help ends well`);
    const flags = [...definition.matchAll(/'(--[a-z][a-z-]*)'/g)].map((m) => m[1]);
    assert.ok(flags.length >= 5, `${file} defines the options of the command`);
    for (const flag of flags) assert.ok(String(help.stdout).includes(flag), `${file}: --help shows ${flag}`);
  }
});

test('with no argument the command says what is missing, and with a project it gets as far as its own code', { skip: hasPython ? false : 'python3 is not here' }, () => {
  for (const file of manifest.scripts.args) {
    const definition = definitionOf(file);
    const none = python(definition, []);
    assert.doesNotMatch(String(none.stderr), /SyntaxError/);
    assert.strictEqual(none.status, 2, `${file}: argparse refuses a call with no project`);
    assert.match(String(none.stderr), /PROJECT_NAME/);
    const project = python(definition, ['demo1']);
    assert.strictEqual(project.status, 0, `${file}: a project alone is a whole call`);
    assert.match(String(project.stdout), /PARSED/);
  }
});

test('an apostrophe inside a help text is escaped: the text is a single-quoted Python string', () => {
  for (const file of manifest.scripts.args) {
    for (const line of definitionOf(file).split('\n')) {
      const m = line.match(/^\s*help='(.*)'\)\s*$/);
      if (m) assert.doesNotMatch(m[1], /(?<!\\)'/, `${file}: ${line.trim().slice(0, 80)}…`);
    }
  }
});
