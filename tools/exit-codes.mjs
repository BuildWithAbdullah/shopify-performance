// Runs the real binary over every artefact, by path and through a symlink, in
// both output modes, and checks the exit code against the one derived from the
// manifest and the severity table.
//
// This exists because a repository can pass every test while the installed
// command prints nothing: npm installs a bin as a symlink, and a main module
// guard that compares an unresolved argv[1] against import.meta.url is false
// through one. Only spawning the real thing finds that.

import { spawn } from 'node:child_process';
import { mkdtemp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { corpusCases, expectedExit, sameSet, describeDifference } from './corpus.mjs';

export function runBinary({ bin, args, cwd }) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => {
      out += c;
    });
    child.stderr.on('data', (c) => {
      err += c;
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

export function tokensFromJson(out) {
  const parsed = JSON.parse(out);
  return parsed.tokens.slice().sort();
}

export function tokensFromText(out) {
  const tokens = new Set();
  for (const line of out.split('\n')) {
    const match = line.match(/^\S+:\d+\s+(error|warn|notice)\s+(\S+)/);
    if (match) tokens.add(match[2] + '@' + match[1]);
  }
  return [...tokens].sort();
}

export async function checkAll({ root, bin }) {
  const cases = corpusCases();
  const problems = [];
  let runs = 0;
  for (const item of cases) {
    const want = expectedExit(item.expected);
    for (const format of ['text', 'json']) {
      const result = await runBinary({ bin, args: [item.path, '--format', format], cwd: root });
      runs += 1;
      if (result.code !== want) {
        problems.push(
          item.path + ' in ' + format + ' mode exited ' + result.code + ', expected ' + want
        );
        continue;
      }
      const actual = format === 'json' ? tokensFromJson(result.out) : tokensFromText(result.out);
      if (!sameSet(actual, item.expected)) {
        problems.push(item.path + ' in ' + format + ' mode: ' + describeDifference(actual, item.expected));
      }
    }
  }
  return { runs, problems, cases: cases.length };
}

export async function checkThroughSymlink({ root, bin }) {
  const dir = await mkdtemp(join(tmpdir(), 'shopify-perf-bin-'));
  const link = join(dir, 'shopify-perf');
  await symlink(bin, link);
  try {
    const cases = corpusCases();
    const problems = [];
    let runs = 0;
    for (const item of cases) {
      const want = expectedExit(item.expected);
      const result = await runBinary({ bin: link, args: [item.path, '--format', 'json'], cwd: root });
      runs += 1;
      if (result.code !== want) {
        problems.push('through a symlink, ' + item.path + ' exited ' + result.code + ', expected ' + want);
        continue;
      }
      const actual = tokensFromJson(result.out);
      if (!sameSet(actual, item.expected)) {
        problems.push('through a symlink, ' + item.path + ': ' + describeDifference(actual, item.expected));
      }
    }
    return { runs, problems };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const here = fileURLToPath(import.meta.url);
  const root = dirname(dirname(here));
  const bin = join(root, 'bin', 'shopify-perf.mjs');
  const direct = await checkAll({ root, bin });
  const linked = await checkThroughSymlink({ root, bin });
  const problems = [...direct.problems, ...linked.problems];
  process.stdout.write(
    direct.runs + ' runs by path and ' + linked.runs + ' through a symlink over ' +
    direct.cases + ' artefacts\n'
  );
  for (const problem of problems) process.stdout.write('  ' + problem + '\n');
  process.stdout.write(problems.length ? problems.length + ' problems\n' : 'exit codes and token sets agree everywhere\n');
  process.exitCode = problems.length ? 1 : 0;
}
