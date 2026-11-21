// Counts the tests in the suite, and is itself the reporter that does the
// counting.
//
// Two traps live here. The first is that reporter text is version dependent:
// the same suite printed '# tests 264' on one Node version and 'info tests 264'
// on another, so nothing here parses output. The second is that the structured
// event stream is version dependent too: run() forwards one pass event per
// whole file on some versions, and details.type is 'suite' on some and
// undefined on others. A custom reporter sees every per test event on every
// version, and selecting anything that is not a suite is the only rule needed.
//
// The default export is the reporter. Running this file spawns node --test with
// this same file as the reporter, which is why the two cannot drift apart.

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

export default async function* reporter(source) {
  let pass = 0;
  let fail = 0;
  for await (const event of source) {
    const type = event && event.data && event.data.details ? event.data.details.type : undefined;
    if (type === 'suite') continue;
    if (event.type === 'test:pass') pass += 1;
    else if (event.type === 'test:fail') fail += 1;
  }
  yield JSON.stringify({ pass, fail, total: pass + fail }) + '\n';
}

// The list of test files comes from package.json, so a new test file that was
// never added to the script cannot be silently left out of every run.
export function testFilesFrom(testScript) {
  return String(testScript)
    .split(/\s+/)
    .filter((part) => part && !part.startsWith('--') && part !== 'node')
    .filter((part) => part.endsWith('.mjs') && !part.includes('tools/'));
}

export async function readTestFiles(root) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  return testFilesFrom(pkg.scripts.test);
}

export function runSuite({ root, reporterPath, files }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--test', '--test-reporter=' + reporterPath, ...files],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

export async function count(root, reporterPath) {
  const files = await readTestFiles(root);
  const { code, out, err } = await runSuite({ root, reporterPath, files });
  const line = out.trim().split('\n').filter(Boolean).pop() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return { ok: false, error: 'the reporter printed nothing parseable', code, out, err };
  }
  return {
    ok: code === 0 && parsed.fail === 0,
    pass: parsed.pass || 0,
    fail: parsed.fail || 0,
    total: parsed.total || 0,
    files: files.length,
    code,
    err
  };
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
  const result = await count(root, here);
  if (!result.ok) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.stdout.write('the suite is not green, so the count is not reportable\n');
    process.exitCode = 1;
  } else {
    process.stdout.write(String(result.total) + '\n');
  }
}
